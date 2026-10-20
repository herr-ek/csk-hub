"use server"

import { type AuthorizationDatabase, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { hasActiveSubscription, sendToUser, subscribe, unsubscribe } from "@/core/notifications"
import { InvalidNotificationSubscriptionError } from "@/core/notifications/subscription-validation"

async function requireUserId(database?: AuthorizationDatabase) {
  const actor = await requirePermission({ action: "app.access" }, database)
  if (actor.impersonatedBy) throw new Error("Push notifications are unavailable while impersonating a User")
  return actor.userId
}

/**
 * Checks the signed-in User's binding without revealing another owner's identity.
 * Unsupported endpoints return `unsupported` so the browser can offer removal.
 * Throws `Unauthorized` without a session, rejects impersonation, and propagates
 * lookup failures rather than reporting them as an absent binding.
 */
export async function getPushSubscriptionBinding(endpoint: string): Promise<"bound" | "unbound" | "unsupported"> {
  const userId = await requireUserId()
  try {
    return (await hasActiveSubscription(userId, endpoint)) ? "bound" : "unbound"
  } catch (error) {
    if (error instanceof InvalidNotificationSubscriptionError) return "unsupported"
    throw error
  }
}

/**
 * Binds validated browser subscription data to the signed-in User. Throws
 * `Unauthorized` without a session, rejects impersonation, and propagates
 * `InvalidNotificationSubscriptionError` or persistence failures.
 */
export async function subscribeUserToPush(subscription: unknown) {
  await db.transaction(async (tx) => subscribe(await requireUserId(tx), subscription, tx))
  return { success: true }
}

/**
 * Removes only the signed-in User's endpoint binding and reports whether it existed.
 * Throws `Unauthorized` without a session, rejects impersonation, and propagates
 * `InvalidNotificationSubscriptionError` or persistence failures.
 */
export async function unsubscribeUserFromPush(endpoint: string) {
  const removed = await db.transaction(async (tx) => unsubscribe(await requireUserId(tx), endpoint, tx))
  return { success: true, removed }
}

/**
 * Sends a test to the signed-in User's active subscriptions and returns provider
 * acceptance counts. Throws `Unauthorized` without a session, rejects
 * impersonation, and propagates subscription lookup failures.
 */
export async function sendPushNotificationTest(message: string) {
  return sendToUser(await requireUserId(), message)
}
