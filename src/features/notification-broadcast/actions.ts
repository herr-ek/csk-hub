"use server"

import { requirePermission } from "@/core/authz"
import { notifyUsers, searchNotificationRecipients } from "./service"
import type { BroadcastResult } from "./types"

export async function sendTestNotificationToAll(message: string): Promise<BroadcastResult> {
  await requirePermission({ action: "notification.broadcast" })
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  return notifyUsers(trimmedMessage)
}

export async function searchNotificationUsers(search: string) {
  await requirePermission({ action: "notification.broadcast" })
  return searchNotificationRecipients(search)
}

export async function sendTestNotificationToUsers(userIds: string[], message: string): Promise<BroadcastResult> {
  await requirePermission({ action: "notification.broadcast" })
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { success: false as const, error: "messageRequired" as const }
  if (userIds.length === 0) return { success: false as const, error: "userRequired" as const }
  return notifyUsers(trimmedMessage, userIds)
}
