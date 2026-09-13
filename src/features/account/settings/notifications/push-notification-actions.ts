"use server"

import { headers } from "next/headers"
import { auth } from "@/core/auth"
import { getTranslations } from "@/core/i18n/server"
import { type NotificationSubscription, sendToUser, subscribe, unsubscribe } from "@/core/notifications"

async function requireMemberId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    const t = await getTranslations("PushNotifications")
    throw new Error(t("signInRequired"))
  }
  return session.user.id
}

export async function subscribeMemberToPush(subscription: NotificationSubscription) {
  await subscribe(await requireMemberId(), subscription)
  return { success: true }
}

export async function unsubscribeMemberFromPush(endpoint: string) {
  await unsubscribe(await requireMemberId(), endpoint)
  return { success: true }
}

export async function sendPushNotificationTest(message: string) {
  return sendToUser(await requireMemberId(), message)
}
