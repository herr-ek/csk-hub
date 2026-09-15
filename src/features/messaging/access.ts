import "server-only"

import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"

export type MessagingErrorKind =
  | "blank-message"
  | "message-too-long"
  | "sign-in-required"
  | "impersonation-unavailable"
  | "recipient-required"
  | "idempotency-key-required"
  | "self-recipient"
  | "conversation-send-forbidden"
  | "conversation-recipient-inactive"
  | "conversation-unavailable"
  | "conversation-view-forbidden"
  | "conversation-not-found"
  | "read-position-invalid"

export class MessagingAccessError extends Error {
  constructor(readonly kind: MessagingErrorKind) {
    super(kind)
    this.name = "MessagingAccessError"
  }
}

/** Returns the signed-in user allowed to use messaging-specific server workflows. */
export async function currentMessagingUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new MessagingAccessError("sign-in-required")
  if (session.session.impersonatedBy) throw new MessagingAccessError("impersonation-unavailable")
  return session.user.id
}
