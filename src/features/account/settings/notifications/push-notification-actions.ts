"use server"

import { type AuthorizationDatabase, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { type NotificationSubscription, sendToUser, subscribe, unsubscribe } from "@/core/notifications"

async function requireUserId(database?: AuthorizationDatabase) {
  return (await requirePermission({ action: "app.access" }, database)).userId
}

export async function subscribeUserToPush(subscription: NotificationSubscription) {
  await db.transaction(async (tx) => subscribe(await requireUserId(tx), subscription, tx))
  return { success: true }
}

export async function unsubscribeUserFromPush(endpoint: string) {
  await db.transaction(async (tx) => unsubscribe(await requireUserId(tx), endpoint, tx))
  return { success: true }
}

export async function sendPushNotificationTest(message: string) {
  return sendToUser(await requireUserId(), message)
}
