import "server-only"

import { and, eq, ilike, or } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { pushSubscription } from "@/core/db/schema/notifications"
import type { NotificationSubscription } from "./types"

export async function subscribe(userId: string, subscription: NotificationSubscription) {
  const now = new Date()
  const values = {
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
    userAgent: subscription.userAgent ?? null,
    deviceLabel: subscription.deviceLabel ?? null,
    status: "active" as const,
    lastSeenAt: now,
    failureCount: 0,
    disabledAt: null,
    disabledReason: null,
    updatedAt: now
  }

  await db
    .insert(pushSubscription)
    .values({ id: crypto.randomUUID(), ...values })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values })
}

export async function unsubscribe(userId: string, endpoint: string) {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
}

export async function listUsersWithActiveSubscriptions(search = "") {
  const normalizedSearch = search.trim()
  const searchFilter = normalizedSearch
    ? or(ilike(user.name, `%${normalizedSearch}%`), ilike(user.email, `%${normalizedSearch}%`))
    : undefined

  return db
    .selectDistinct({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .innerJoin(pushSubscription, eq(pushSubscription.userId, user.id))
    .where(and(eq(pushSubscription.status, "active"), searchFilter))
    .orderBy(user.name)
    .limit(25)
}
