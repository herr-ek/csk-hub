import "server-only"

import { handleActivityAcknowledgement } from "./acknowledge"
import type { ActivityDeliveryPolicy } from "./delivery-access"
import { notifyUsers, searchNotificationUsers } from "./notifications"
import { scheduleActivityDispatch } from "./schedule-dispatch"
import { handleActivityStream } from "./stream"

/**
 * Binds the shared delivery workflow to current feature access/read rules. Compose once
 * above core and share the result across features and routes. Notification callers still
 * own authorization and recipient selection; schedule dispatch only after commit.
 */
export function createActivityDelivery(policy: ActivityDeliveryPolicy) {
  return {
    handleActivityAcknowledgement: (request: Request) => handleActivityAcknowledgement(policy, request),
    handleActivityStream: (request: Request) => handleActivityStream(policy, request),
    notifyUsers: (message: string, userIds?: string[]) => notifyUsers(policy, message, userIds),
    searchNotificationUsers,
    scheduleActivityDispatch: () => scheduleActivityDispatch(policy)
  }
}
