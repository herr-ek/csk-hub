"use server"

import { requireAdmin } from "@/core/auth/permissions.server"
import { listUsersWithActiveSubscriptions, sendToAll, sendToUsers } from "@/core/notifications"

export async function sendTestNotificationToAll(message: string) {
  await requireAdmin()
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  return sendToAll(trimmedMessage)
}

export async function searchUsersWithSubscriptions(search: string) {
  await requireAdmin()
  return listUsersWithActiveSubscriptions(search)
}

export async function sendTestNotificationToUsers(userIds: string[], message: string) {
  await requireAdmin()
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  if (userIds.length === 0) return { success: false as const, error: "userRequired" as const }
  return sendToUsers(userIds, trimmedMessage)
}
