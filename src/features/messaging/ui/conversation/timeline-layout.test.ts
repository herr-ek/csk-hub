import { describe, expect, test } from "bun:test"
import { getMessageLayout } from "./timeline-layout"
import { createMessageCalendarDayKey } from "./timestamp"

const at = (value: string) => new Date(value)
const calendarDay = createMessageCalendarDayKey("Europe/Stockholm")

describe("getMessageLayout", () => {
  test("keeps consecutive messages from one person compact for five minutes", () => {
    expect(
      getMessageLayout(
        [
          { isOwnMessage: true, sentAt: at("2026-09-07T10:00:00Z") },
          { isOwnMessage: true, sentAt: at("2026-09-07T10:04:59Z") },
          { isOwnMessage: true, sentAt: at("2026-09-07T10:09:59Z") }
        ],
        calendarDay
      )
    ).toEqual([
      { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false },
      { startsNewGroup: false, showsDayDivider: false, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: false, showsTimeSeparator: false }
    ])
  })

  test("starts a group when the sender changes and marks a one-hour pause", () => {
    expect(
      getMessageLayout(
        [
          { isOwnMessage: false, sentAt: at("2026-09-07T10:00:00Z") },
          { isOwnMessage: true, sentAt: at("2026-09-07T10:01:00Z") },
          { isOwnMessage: true, sentAt: at("2026-09-07T11:01:00Z") }
        ],
        calendarDay
      )
    ).toEqual([
      { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: false, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: false, showsTimeSeparator: true }
    ])
  })

  test("uses a date divider instead of a time separator across days", () => {
    expect(
      getMessageLayout(
        [
          { isOwnMessage: false, sentAt: at("2026-09-07T21:59:00Z") },
          { isOwnMessage: false, sentAt: at("2026-09-07T22:01:00Z") }
        ],
        calendarDay
      )
    ).toEqual([
      { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: true, showsTimeSeparator: false }
    ])
  })

  test("uses the configured time zone when deciding whether to show a day divider", () => {
    const stockholmDay = createMessageCalendarDayKey("Europe/Stockholm")

    expect(
      getMessageLayout(
        [
          { isOwnMessage: false, sentAt: at("2026-09-07T21:59:00Z") },
          { isOwnMessage: false, sentAt: at("2026-09-07T22:01:00Z") }
        ],
        stockholmDay
      )
    ).toMatchObject([{ showsDayDivider: true }, { showsDayDivider: true }])
  })

  test("keeps messages on the same configured day across a daylight-saving transition", () => {
    const stockholmDay = createMessageCalendarDayKey("Europe/Stockholm")

    expect(
      getMessageLayout(
        [
          { isOwnMessage: false, sentAt: at("2026-03-29T00:59:00Z") },
          { isOwnMessage: false, sentAt: at("2026-03-29T01:01:00Z") }
        ],
        stockholmDay
      )
    ).toMatchObject([{ showsDayDivider: true }, { showsDayDivider: false }])
  })
})

test("separates Messages from two other Group Conversation authors", () => {
  const time = new Date("2026-10-04T12:00:00Z")
  const layout = getMessageLayout(
    [
      { sentAt: time, isOwnMessage: false, authorUserId: "alice" },
      { sentAt: time, isOwnMessage: false, authorUserId: "bob" }
    ],
    (date) => date.toISOString().slice(0, 10)
  )
  expect(layout[1].startsNewGroup).toBe(true)
})
