import type { createFormatter } from "use-intl/core"

export type MessageDateTimeFormatter = Pick<ReturnType<typeof createFormatter>, "dateTime">

export function formatMessageSentAt(format: MessageDateTimeFormatter, sentAt: Date) {
  return format.dateTime(sentAt, { dateStyle: "medium", timeStyle: "short" })
}
