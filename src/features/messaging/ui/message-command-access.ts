import "server-only"

import { AuthorizationDeniedError, requirePermission } from "@/core/authz"
import { MessagingAccessError } from "../model/messaging-error"

/** Prevents support impersonation from being used to author Messages as another User. */
export async function requireMessageSendingAvailable() {
  try {
    await requirePermission({ action: "messaging.access" })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError)
      throw new MessagingAccessError(error.actor?.impersonatedBy ? "impersonation-unavailable" : "sign-in-required")
    throw error
  }
}
