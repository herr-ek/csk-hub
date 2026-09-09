import { describe, expect, test } from "bun:test"
import { getDirectMessageLayout } from "./direct-message-layout"

const at = (value: string) => new Date(value)

describe("getDirectMessageLayout", () => {
  test("keeps consecutive messages from one person compact for five minutes", () => {
    expect(
      getDirectMessageLayout([
        { isOwnMessage: true, sentAt: at("2026-09-07T10:00:00Z") },
        { isOwnMessage: true, sentAt: at("2026-09-07T10:04:59Z") },
        { isOwnMessage: true, sentAt: at("2026-09-07T10:09:59Z") }
      ])
    ).toEqual([
      { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false },
      { startsNewGroup: false, showsDayDivider: false, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: false, showsTimeSeparator: false }
    ])
  })

  test("starts a group when the sender changes and marks a one-hour pause", () => {
    expect(
      getDirectMessageLayout([
        { isOwnMessage: false, sentAt: at("2026-09-07T10:00:00Z") },
        { isOwnMessage: true, sentAt: at("2026-09-07T10:01:00Z") },
        { isOwnMessage: true, sentAt: at("2026-09-07T11:01:00Z") }
      ])
    ).toEqual([
      { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: false, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: false, showsTimeSeparator: true }
    ])
  })

  test("uses a date divider instead of a time separator across days", () => {
    expect(
      getDirectMessageLayout([
        { isOwnMessage: false, sentAt: at("2026-09-07T23:59:00Z") },
        { isOwnMessage: false, sentAt: at("2026-09-08T00:01:00Z") }
      ])
    ).toEqual([
      { startsNewGroup: false, showsDayDivider: true, showsTimeSeparator: false },
      { startsNewGroup: true, showsDayDivider: true, showsTimeSeparator: false }
    ])
  })
})
