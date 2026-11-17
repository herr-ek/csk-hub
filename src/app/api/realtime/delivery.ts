import "server-only"

import { createActivityDelivery } from "@/core/realtime/server"
import { conversationActivityPolicy } from "@/features/messaging/activity"

export const { handleActivityAcknowledgement, handleActivityStream } =
  createActivityDelivery(conversationActivityPolicy)
