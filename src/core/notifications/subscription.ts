import "server-only"

import { and, eq, ilike, isNull, or } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { pushSubscription } from "@/core/db/schema/notifications"
import { parseNotificationSubscription, parsePushEndpoint } from "./subscription-validation"

/**
 * Validates untrusted subscription data and stores it for an authorized User.
 * Rebinding an existing endpoint transfers ownership, replaces its keys, and
 * resets disabled/failure metadata. Callers must authorize the supplied userId.
 * Throws `InvalidNotificationSubscriptionError` for invalid data; persistence failures reject.
 */
export async function subscribe(
  userId: string,
  subscription: unknown,
  database: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
) {
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

  await database
    .insert(pushSubscription)
    .values({ id: crypto.randomUUID(), ...values })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values })
}

/**
 * Removes an endpoint only when it belongs to the supplied, caller-authorized User.
 * Returns whether an owned row was removed. Throws
 * `InvalidNotificationSubscriptionError` for invalid endpoints; persistence failures reject.
 */
export async function unsubscribe(
  userId: string,
  endpoint: string,
  database: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
) {
  const normalizedEndpoint = parsePushEndpoint(endpoint)
  const [deleted] = await database
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, normalizedEndpoint)))
    .returning({ id: pushSubscription.id })

  return Boolean(deleted)
}

/**
 * Checks for an active binding belonging to the caller-authorized User, without
 * revealing another owner's identity. Returns false for absent or disabled bindings.
 * Throws `InvalidNotificationSubscriptionError` for invalid endpoints; lookup failures reject.
 */
export async function hasActiveSubscription(
  userId: string,
  endpoint: string,
  database: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
) {
  const normalizedEndpoint = parsePushEndpoint(endpoint)
  const [subscription] = await database
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
    .where(and(eq(pushSubscription.status, "active"), or(eq(user.banned, false), isNull(user.banned)), searchFilter))
    .orderBy(user.name)
    .limit(25)
}
