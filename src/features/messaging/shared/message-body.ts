export const MAX_MESSAGE_BODY_LENGTH = 4_000

export type MessageBodyValidation =
  | { success: true; data: string }
  | { success: false; error: "blank-message" | "message-too-long" }

export function validateMessageBody(value: unknown): MessageBodyValidation {
  if (typeof value !== "string") return { success: false, error: "blank-message" }

  const text = value.trim()
  if (!text) return { success: false, error: "blank-message" }
  if (text.length > MAX_MESSAGE_BODY_LENGTH) return { success: false, error: "message-too-long" }

  return { success: true, data: text }
}
