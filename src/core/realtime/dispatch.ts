import "server-only"

import { and, eq, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { activityDelivery } from "@/core/db/schema/activity"
import { logger } from "@/core/logging"
import { sendToUser } from "@/core/notifications"
import { type ActivityBroker, connectActivityBroker, publishActivity } from "@/core/realtime/broker"
import { type ActivityDeliveryPolicy, type Delivery, isDeliveryAllowed } from "./delivery-access"

async function claimDelivery() {
  return db.transaction(async (tx) => {
    const now = sql`now()`
    const [row] = await tx
      .select()
      .from(activityDelivery)
      .where(
        and(
          or(isNull(activityDelivery.leaseUntil), lt(activityDelivery.leaseUntil, now)),
          or(
            and(isNull(activityDelivery.publishedAt), lte(activityDelivery.publishAfter, now)),
            and(
              isNull(activityDelivery.pushCompletedAt),
              isNull(activityDelivery.acknowledgedAt),
              lte(activityDelivery.pushAfter, now)
            )
          )
        )
      )
      .orderBy(activityDelivery.createdAt)
      .limit(1)
      .for("update", { skipLocked: true })
    if (!row) return null
    const [claimed] = await tx
      .update(activityDelivery)
      .set({
        leaseToken: crypto.randomUUID(),
        leaseUntil: sql`now() + interval '90 seconds'`,
        attempts: row.attempts + 1
      })
      .where(eq(activityDelivery.id, row.id))
      .returning()
    return claimed
  })
}

async function dispatchOne(
  policy: ActivityDeliveryPolicy,
  delivery: Delivery,
  publish: (userId: string, deliveryId: string) => Promise<void>
) {
  const owned = and(eq(activityDelivery.id, delivery.id), eq(activityDelivery.leaseToken, delivery.leaseToken ?? ""))
  const updates: {
    [K in keyof typeof activityDelivery.$inferInsert]?: (typeof activityDelivery.$inferInsert)[K] | SQL
  } = { leaseUntil: null, leaseToken: null }
  const retryMs = Math.min(60_000, 1_000 * 2 ** Math.min(delivery.attempts, 6))
  const retryAt = sql`now() + (${retryMs} * interval '1 millisecond')`
  try {
    if (!(await isDeliveryAllowed(policy, delivery))) {
      updates.publishedAt = sql`now()`
      updates.pushCompletedAt = sql`now()`
      return
    }
    if (!delivery.publishedAt) {
      try {
        await publish(delivery.userId, delivery.id)
        updates.publishedAt = sql`now()`
      } catch {
        updates.publishAfter = retryAt
        logger.warn("realtime.publish.retry", { deliveryId: delivery.id })
      }
    }
    if (delivery.pushAfter && !delivery.pushCompletedAt) {
      // Re-read acknowledgement after publishing: a foreground browser may have handled it.
      const [current] = await db
        .select()
        .from(activityDelivery)
        .where(and(owned, lte(activityDelivery.pushAfter, sql`now()`)))
      if (!current) return
      if (
        current.acknowledgedAt ||
        (await policy.isAlreadyOpened(current)) ||
        !(await isDeliveryAllowed(policy, current))
      ) {
        updates.pushCompletedAt = sql`now()`
      } else if (current.body) {
        const result = await sendToUser(current.userId, current.body, {
          title: current.title ?? undefined,
          href: current.href ?? undefined,
          tag: current.id
        })
        if (result.success || result.error === "noActiveSubscriptions") updates.pushCompletedAt = sql`now()`
        else {
          updates.pushAfter = retryAt
          logger.warn("realtime.push.retry", { deliveryId: delivery.id, attempts: delivery.attempts })
        }
      } else {
        updates.pushCompletedAt = sql`now()`
      }
    }
  } catch {
    updates.publishAfter = retryAt
    if (delivery.pushAfter) updates.pushAfter = retryAt
    logger.error("realtime.delivery.retry", { deliveryId: delivery.id })
  } finally {
    await db.update(activityDelivery).set(updates).where(owned)
  }
}

/** Processes one bounded batch. Leases coordinate concurrent dispatches; abort finishes the current delivery. */
export async function dispatchActivity(policy: ActivityDeliveryPolicy, signal?: AbortSignal) {
  if (!env.REDIS_URL) return { processed: 0 }
  let processed = 0
  let broker: Promise<ActivityBroker> | undefined
  const deadline = Date.now() + 20_000
  try {
    while (!signal?.aborted && processed < 50 && Date.now() < deadline) {
      const delivery = await claimDelivery()
      if (!delivery) break
      await dispatchOne(policy, delivery, async (userId, deliveryId) => {
        broker ??= connectActivityBroker()
        await publishActivity(await broker, userId, deliveryId)
      })
      processed++
    }
  } finally {
    const connection = await broker?.catch(() => undefined)
    if (connection?.isOpen) connection.destroy()
  }
  return { processed }
}

/**
 * Milliseconds until the next publication, push, or abandoned lease is eligible, measured
 * against the database clock. Null means no work remains. Acknowledged push is not pending.
 */
export async function nextActivityDelay(): Promise<number | null> {
  const [row] = await db
    .select({
      delay: sql<number | null>`extract(epoch from (min(greatest(
      coalesce(${activityDelivery.leaseUntil}, now()),
      least(
        case when ${activityDelivery.publishedAt} is null then ${activityDelivery.publishAfter} end,
        case when ${activityDelivery.pushCompletedAt} is null and ${activityDelivery.acknowledgedAt} is null
          then ${activityDelivery.pushAfter} end
      )
    )) - now())) * 1000`
    })
    .from(activityDelivery)
    .where(
      or(
        isNull(activityDelivery.publishedAt),
        and(
          isNull(activityDelivery.pushCompletedAt),
          isNull(activityDelivery.acknowledgedAt),
          sql`${activityDelivery.pushAfter} is not null`
        )
      )
    )
  return row?.delay === null || row?.delay === undefined ? null : Math.max(0, Number(row.delay))
}

/** Removes deliveries older than seven days and reports expired unfinished work. */
export async function pruneActivity() {
  const result = await db.execute(sql`with expired as (
    delete from ${activityDelivery} where ${activityDelivery.createdAt} < now() - interval '7 days'
    returning published_at, push_after, push_completed_at, acknowledged_at
  ) select count(*)::int as removed, count(*) filter (where published_at is null or
    (push_after is not null and push_completed_at is null and acknowledged_at is null))::int as unfinished
    from expired`)
  const removed = Number(result.rows[0]?.removed ?? 0)
  const unfinished = Number(result.rows[0]?.unfinished ?? 0)
  if (unfinished) logger.warn("realtime.delivery.expired", { count: unfinished })
  if (removed) logger.info("realtime.retention.pruned", { count: removed })
}
