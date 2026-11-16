import "server-only"

import { scheduleActivityDispatch as scheduleDispatch } from "@/core/realtime/schedule-dispatch"
import { conversationActivityPolicy } from "./delivery-policy"

/** After commit, drains shared activity using Messaging’s current access and read-state checks. */
export function scheduleActivityDispatch() {
  scheduleDispatch(conversationActivityPolicy)
}
