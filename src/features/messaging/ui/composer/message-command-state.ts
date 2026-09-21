import type { MessagingErrorKind } from "../../model/messaging-error"

export type MessageCommandState =
  | { status: "idle" }
  | { status: "error"; error: MessagingErrorKind | "unexpected"; text: string }
  | { status: "success"; conversationId: string }
