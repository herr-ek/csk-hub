import "server-only"

import { eq, isNull, or, sql } from "drizzle-orm"
import { env } from "@/core/config/env"
import type { db } from "@/core/db"
import { activityDelivery } from "@/core/db/schema/activity"
import { user } from "@/core/db/schema/auth"
import type { ActivityChange } from "./events"

export type ActivityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type ActivityNotification = { body: string; title?: string; href?: string }
export const PUSH_GRACE_MS = 8_000

/**
 * Enqueues activity in the caller's transaction. The caller owns authorization and
 * recipient selection. With Redis unconfigured, existing non-realtime behavior is kept.
 * Never publish to Redis before this transaction commits.
 */
export async function queueActivity(
  tx: ActivityTransaction,
  userIds: string[],
  change: ActivityChange,
  notification?: ActivityNotification
) {
  if (!env.REDIS_URL || !userIds.length) return
  await tx.insert(activityDelivery).values(
    [...new Set(userIds)].map((userId) => ({
      userId,
      change,
      body: notification?.body,
      title: notification?.title,
      href: notification?.href,
      pushAfter: notification ? sql`now() + (${PUSH_GRACE_MS} * interval '1 millisecond')` : null
    }))
  )
}

/** Enqueues a content-free change for every active User, inside the feature write transaction. */
export async function queuePublicActivity(tx: ActivityTransaction, change: ActivityChange) {
  if (!env.REDIS_URL) return
  const users = await tx
    .select({ id: user.id })
    .from(user)
    .where(or(eq(user.banned, false), isNull(user.banned)))
  await queueActivity(
    tx,
    users.map(({ id }) => id),
    change
  )
}
