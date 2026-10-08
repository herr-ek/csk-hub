"use server"

import { headers } from "next/headers"
import { auth } from "@/core/auth"
import {
  hasActiveSubscription,
  type NotificationSubscription,
  sendToUser,
  subscribe,
  unsubscribe
} from "@/core/notifications"

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error("Unauthorized")
  }
  if (session.session.impersonatedBy) {
    throw new Error("Push notifications are unavailable while impersonating a User")
  }
  return session.user.id
}

export async function isPushSubscriptionBoundToCurrentUser(endpoint: string) {
  return hasActiveSubscription(await requireUserId(), endpoint)
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
