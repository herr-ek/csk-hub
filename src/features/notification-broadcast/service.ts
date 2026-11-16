import "server-only"

import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { listUsersWithActiveSubscriptions, sendToAll, sendToUsers } from "@/core/notifications"
import { queueActivity } from "@/core/realtime/outbox"
import { scheduleActivityDispatch } from "@/features/messaging/activity"
import type { BroadcastResult } from "./types"

/** Authorized callers select recipients; success distinguishes queued activity from accepted push. */
export async function notifyUsers(message: string, userIds?: string[]): Promise<BroadcastResult> {
  if (!env.REDIS_URL) {
    const result = await (userIds ? sendToUsers(userIds, { body: message }) : sendToAll({ body: message }))
    return result.success ? { ...result, delivery: "sent" } : { success: false, error: result.error }
  }
  const ids = userIds ? [...new Set(userIds)] : undefined
  if (ids && !ids.length) return { success: false, error: "noRecipients" }
  const queued = await db.transaction(async (tx) => {
    const recipients = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(or(eq(user.banned, false), isNull(user.banned)), ids ? inArray(user.id, ids) : undefined))
    await queueActivity(
      tx,
      recipients.map(({ id }) => id),
      { kind: "notification.created" },
      { body: message, href: "/" }
    )
    return recipients.length
  })
  if (!queued) return { success: false, error: "noRecipients" }
  scheduleActivityDispatch()
  return { success: true, delivery: "queued", queued }
}

/** Lists up to 25 eligible recipients and whether receiving requires an active push subscription. */
export async function searchNotificationRecipients(search: string) {
  if (!env.REDIS_URL) return { users: await listUsersWithActiveSubscriptions(search), requiresPush: true }
  const normalized = search.trim()
  const pattern = `%${normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
  const users = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(
        or(eq(user.banned, false), isNull(user.banned)),
        normalized ? or(ilike(user.name, pattern), ilike(user.email, pattern)) : undefined
      )
    )
    .orderBy(user.name)
    .limit(25)
  return { users, requiresPush: false }
}
