"use server"

import { headers } from "next/headers"
import { auth } from "@/core/auth"
import { type NotificationSubscription, sendToUser, subscribe, unsubscribe } from "@/core/notifications"

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error("Unauthorized")
  }
  return session.user.id
}

export async function subscribeUserToPush(subscription: NotificationSubscription) {
  await subscribe(await requireUserId(), subscription)
  return { success: true }
}

export async function unsubscribeUserFromPush(endpoint: string) {
  await unsubscribe(await requireUserId(), endpoint)
  return { success: true }
}

export async function sendPushNotificationTest(message: string) {
  return sendToUser(await requireUserId(), message)
}
