"use server"

import { requireAdmin } from "@/core/auth/permissions.server"
import { notifyUsers, searchNotificationRecipients } from "./service"
import type { BroadcastResult } from "./types"

export async function sendTestNotificationToAll(message: string): Promise<BroadcastResult> {
  await requireAdmin()
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  return notifyUsers(trimmedMessage)
}

export async function searchNotificationUsers(search: string) {
  await requireAdmin()
  return searchNotificationRecipients(search)
}

export async function sendTestNotificationToUsers(userIds: string[], message: string): Promise<BroadcastResult> {
  await requireAdmin()
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  if (userIds.length === 0) return { success: false as const, error: "userRequired" as const }
  return notifyUsers(trimmedMessage, userIds)
}
