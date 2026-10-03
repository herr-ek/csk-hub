import "server-only"

import { headers } from "next/headers"
import { auth } from "@/core/auth"
import { MessagingAccessError } from "../model/messaging-error"

/** Prevents support impersonation from being used to author Messages as another User. */
export async function requireMessageSendingAvailable() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (session?.session.impersonatedBy) throw new MessagingAccessError("impersonation-unavailable")
}
