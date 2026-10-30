"use server"

import { requireAdmin } from "@/core/auth/permissions.server"
import { env } from "@/core/config/env"
import { listUsersWithActiveSubscriptions, sendToAll, sendToUsers } from "@/core/notifications"
import { notifyUsers, searchNotificationUsers } from "@/features/activity/server"

export async function sendTestNotificationToAll(message: string) {
  await requireAdmin()
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  return env.REDIS_URL ? notifyUsers(trimmedMessage) : sendToAll(trimmedMessage)
}

export async function searchUsersWithSubscriptions(search: string) {
  await requireAdmin()
  return env.REDIS_URL ? searchNotificationUsers(search) : listUsersWithActiveSubscriptions(search)
}

export async function sendTestNotificationToUsers(userIds: string[], message: string) {
  await requireAdmin()
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  if (userIds.length === 0) return { success: false as const, error: "userRequired" as const }
  return env.REDIS_URL ? notifyUsers(trimmedMessage, userIds) : sendToUsers(userIds, trimmedMessage)
}
