"use server"

import { getRequestSession } from "@/core/auth/session.server"
import {
  hasActiveSubscription,
  type NotificationSubscription,
  sendToUser,
  subscribe,
  unsubscribe
} from "@/core/notifications"
import { InvalidNotificationSubscriptionError } from "@/core/notifications/subscription-validation"

async function requireUserId() {
  const session = await getRequestSession()
  if (!session) {
    throw new Error("Unauthorized")
  }
  if (session.session.impersonatedBy) {
    throw new Error("Push notifications are unavailable while impersonating a User")
  }
  return session.user.id
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

export async function subscribeUserToPush(subscription: NotificationSubscription) {
  await subscribe(await requireUserId(), subscription)
  return { success: true }
}

export async function unsubscribeUserFromPush(endpoint: string) {
  const removed = await unsubscribe(await requireUserId(), endpoint)
  return { success: true, removed }
}

export async function sendPushNotificationTest(message: string) {
  return sendToUser(await requireUserId(), message)
}
