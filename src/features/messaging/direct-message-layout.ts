const GROUP_BREAK_MS = 5 * 60 * 1000
const TIME_SEPARATOR_MS = 60 * 60 * 1000

type DirectMessageLayoutInput = {
  sentAt: Date
  isOwnMessage: boolean
}

export type DirectMessageLayout = {
  startsNewGroup: boolean
  showsDayDivider: boolean
  showsTimeSeparator: boolean
}

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

export function getDirectMessageLayout(messages: DirectMessageLayoutInput[]): DirectMessageLayout[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1]
    if (!previous) return { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false }

    const elapsed = message.sentAt.getTime() - previous.sentAt.getTime()
    const showsDayDivider = !isSameCalendarDay(message.sentAt, previous.sentAt)

    return {
      startsNewGroup: showsDayDivider || previous.isOwnMessage !== message.isOwnMessage || elapsed >= GROUP_BREAK_MS,
      showsDayDivider,
      showsTimeSeparator: !showsDayDivider && elapsed >= TIME_SEPARATOR_MS
    }
  })
}
