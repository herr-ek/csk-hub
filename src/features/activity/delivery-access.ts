import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/core/db"
import type { activityDelivery } from "@/core/db/schema/activity"
import { user } from "@/core/db/schema/auth"
import { canReceiveConversationActivity, hasOpenedMessage } from "@/features/messaging/activity"

export type Delivery = typeof activityDelivery.$inferSelect

/** Rechecks the recipient's current account and Conversation access before delivery. */
export async function isDeliveryAllowed(delivery: Delivery) {
  const [recipient] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, delivery.userId))
  if (!recipient || recipient.banned) return false
  const conversationId = delivery.change.conversationId
  return !conversationId || canReceiveConversationActivity(delivery.userId, conversationId)
}

/** Whether authoritative read state already makes a Message notification unnecessary. */
export async function isDeliveryAlreadyOpened(delivery: Delivery) {
  const { conversationId, sequence } = delivery.change
  return delivery.change.kind === "message.created" && conversationId && sequence
    ? hasOpenedMessage(delivery.userId, conversationId, sequence)
    : false
}
