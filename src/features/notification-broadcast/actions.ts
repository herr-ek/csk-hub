"use server"

import { requirePermission } from "@/core/authz"
import { listUsersWithActiveSubscriptions, sendToAll, sendToUsers } from "@/core/notifications"

export async function sendTestNotificationToAll(message: string) {
  await requirePermission({ action: "notification.broadcast" })
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  return sendToAll(trimmedMessage)
}

export async function searchUsersWithSubscriptions(search: string) {
  await requirePermission({ action: "notification.broadcast" })
  return listUsersWithActiveSubscriptions(search)
}

export async function sendTestNotificationToUsers(userIds: string[], message: string) {
  await requirePermission({ action: "notification.broadcast" })
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  if (userIds.length === 0) return { success: false as const, error: "userRequired" as const }
  return sendToUsers(userIds, trimmedMessage)
}
