import "server-only"

import { getRequestSession } from "@/core/auth/session.server"
import { MessagingAccessError } from "../model/messaging-error"

/** Prevents support impersonation from being used to author Messages as another User. */
export async function requireMessageSendingAvailable() {
  const session = await getRequestSession()

  if (session?.session.impersonatedBy) throw new MessagingAccessError("impersonation-unavailable")
}
