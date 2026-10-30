import "server-only"

import { createActivityDelivery } from "@/core/realtime/server"
import { conversationActivityPolicy } from "@/features/messaging/activity"

// App composition lives above core so transport and delivery never import feature code.
export const {
  handleActivityAcknowledgement,
  handleActivityStream,
  notifyUsers,
  searchNotificationUsers,
  scheduleActivityDispatch
} = createActivityDelivery(conversationActivityPolicy)
