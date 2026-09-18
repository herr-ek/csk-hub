import type { MessageDateTimeFormatter } from "../shared/message-timestamp"

export function formatMessageDay(format: MessageDateTimeFormatter, sentAt: Date) {
  return format.dateTime(sentAt, { dateStyle: "medium" })
}

export function formatMessageTime(format: MessageDateTimeFormatter, sentAt: Date) {
  return format.dateTime(sentAt, { timeStyle: "short" })
}

export function createMessageCalendarDayKey(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  })
  return (sentAt: Date) => formatter.format(sentAt)
}
