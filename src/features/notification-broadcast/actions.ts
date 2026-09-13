"use server"

import { requireAdmin } from "@/core/auth/permissions.server"
import { getTranslations } from "@/core/i18n/server"
import { listUsersWithActiveSubscriptions, sendToAll, sendToUsers } from "@/core/notifications"

export async function sendTestNotificationToAll(message: string) {
  await requireAdmin()
  const t = await getTranslations("PushNotifications")
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: t("messageRequired") }
  return sendToAll(trimmedMessage)
}

export async function searchUsersWithSubscriptions(search: string) {
  await requireAdmin()
  return listUsersWithActiveSubscriptions(search)
}

export async function sendTestNotificationToUsers(userIds: string[], message: string) {
  await requireAdmin()
  const t = await getTranslations("PushNotifications")
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: t("messageRequired") }
  if (userIds.length === 0) return { success: false as const, error: t("userRequired") }
  return sendToUsers(userIds, trimmedMessage)
}
