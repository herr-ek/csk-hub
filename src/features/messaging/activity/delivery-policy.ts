import "server-only"

import type { ActivityDeliveryPolicy } from "@/core/realtime/delivery-access"
import { canReceiveConversationActivity, hasOpenedMessage } from "./events"

/** Conversation access and read-state rules used by the app's shared activity delivery. */
export const conversationActivityPolicy: ActivityDeliveryPolicy = {
  async canDeliver(delivery) {
    const conversationId = delivery.change.conversationId
    return !conversationId || canReceiveConversationActivity(delivery.userId, conversationId)
  },
  async isAlreadyOpened(delivery) {
    const { conversationId, sequence } = delivery.change
    return delivery.change.kind === "message.created" && conversationId && sequence
      ? hasOpenedMessage(delivery.userId, conversationId, sequence)
      : false
  }
}
