import "server-only"

import { and, eq, ilike, or } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { pushSubscription } from "@/core/db/schema/notifications"
import { normalizePushEndpoint, parseNotificationSubscription } from "./subscription-validation"

/**
 * Stores a User's browser subscription by endpoint, reactivating and refreshing
 * lifecycle metadata when that endpoint already exists.
 */
export async function subscribe(userId: string, subscription: unknown) {
  const validated = parseNotificationSubscription(subscription)
  const now = new Date()
  const values = {
    userId,
    endpoint: validated.endpoint,
    p256dh: validated.keys.p256dh,
    auth: validated.keys.auth,
    expirationTime: validated.expirationTime ? new Date(validated.expirationTime) : null,
    userAgent: validated.userAgent ?? null,
    deviceLabel: validated.deviceLabel ?? null,
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

/** Removes a browser subscription only when it belongs to the specified User. */
export async function unsubscribe(userId: string, endpoint: string) {
  const normalizedEndpoint = normalizePushEndpoint(endpoint)
  const [deleted] = await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, normalizedEndpoint)))
    .returning({ id: pushSubscription.id })

  return Boolean(deleted)
}

/** Checks whether an endpoint is actively bound to the specified User without revealing its owner. */
export async function hasActiveSubscription(userId: string, endpoint: string) {
  const normalizedEndpoint = normalizePushEndpoint(endpoint)
  const [subscription] = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, userId),
        eq(pushSubscription.endpoint, normalizedEndpoint),
        eq(pushSubscription.status, "active")
      )
    )
    .limit(1)

  return Boolean(subscription)
}

/** Returns at most 25 active push subscribers whose name or email matches the optional search text. */
export async function listUsersWithActiveSubscriptions(search: string = "") {
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
