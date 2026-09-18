import type { MessagingErrorKind } from "../errors"

export type MessageCommandState =
  | { status: "idle" }
  | { status: "error"; error: MessagingErrorKind | "unexpected" }
  | { status: "success"; conversationId: string }
