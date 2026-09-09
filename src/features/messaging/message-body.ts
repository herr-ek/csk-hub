export type MessageBodyValidation = { success: true; data: string } | { success: false; error: string }

export function validateMessageBody(value: unknown): MessageBodyValidation {
  if (typeof value !== "string") return { success: false, error: "Enter a message." }

  const text = value.trim()
  if (!text) return { success: false, error: "Enter a message." }
  if (text.length > 4_000) return { success: false, error: "Messages can be at most 4,000 characters." }

  return { success: true, data: text }
}
