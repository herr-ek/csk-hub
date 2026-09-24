export type MessagingErrorKind =
  | "blank-message"
  | "message-too-long"
  | "sign-in-required"
  | "impersonation-unavailable"
  | "recipient-required"
  | "recipient-inactive"
  | "idempotency-key-required"
  | "idempotency-key-reused"
  | "self-recipient"
  | "conversation-send-forbidden"
  | "conversation-recipient-inactive"
  | "conversation-unavailable"
  | "conversation-view-forbidden"
  | "conversation-not-found"
  | "read-position-invalid"

/** A user-safe error emitted when a messaging workflow cannot proceed. */
export class MessagingAccessError extends Error {
  constructor(readonly kind: MessagingErrorKind) {
    super(kind)
    this.name = "MessagingAccessError"
  }
}
