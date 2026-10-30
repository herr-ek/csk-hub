import "server-only"

import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { sendToAll, sendToUsers } from "@/core/notifications"
import { queueActivity } from "@/core/realtime/outbox"
import { scheduleActivityDispatch } from "./schedule-dispatch"

/** Authorized callers select the audience. Live feedback does not require push permission. */
export async function notifyUsers(message: string, userIds?: string[]) {
  if (!env.REDIS_URL) return userIds ? sendToUsers(userIds, message) : sendToAll(message)
  const ids = userIds ? [...new Set(userIds)] : undefined
  if (ids && !ids.length) return { success: false as const, error: "noRecipients" as const }
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
  scheduleActivityDispatch()
  return queued ? { success: true as const, queued } : { success: false as const, error: "noRecipients" as const }
}

/** Eligible notification recipients, including Users who can receive only in-app feedback. */
export async function searchNotificationUsers(search: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(
        or(eq(user.banned, false), isNull(user.banned)),
        search.trim() ? or(ilike(user.name, `%${search.trim()}%`), ilike(user.email, `%${search.trim()}%`)) : undefined
      )
    )
    .orderBy(user.name)
    .limit(25)
}
