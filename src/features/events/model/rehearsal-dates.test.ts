import { expect, test } from "bun:test"
import { MAX_SERIES_DATES, weekdayOf, weeklyDates } from "./rehearsal-dates"

const today = "2026-11-22" // a Sunday

test("weekdays are ISO: Monday 1 to Sunday 7", () => {
  expect(weekdayOf("2026-11-23")).toBe(1)
  expect(weekdayOf("2026-11-22")).toBe(7)
})

test("lists the weekday through the range, both ends included", () => {
  expect(weeklyDates(2, "2026-11-24", "2026-12-08", today)).toEqual({
    success: true,
    data: ["2026-11-24", "2026-12-01", "2026-12-08"]
  })
  // A range starting on another weekday begins at the first matching day, across a year end.
  expect(weeklyDates(4, "2026-12-28", "2027-01-08", today)).toEqual({
    success: true,
    data: ["2026-12-31", "2027-01-07"]
  })
  expect(weeklyDates(7, today, today, today)).toEqual({ success: true, data: [today] })
})

test("refuses reversed, past, empty, oversized and malformed ranges", () => {
  expect(weeklyDates(2, "2026-12-08", "2026-11-24", today)).toEqual({ success: false, error: "last-day-before-first" })
  expect(weeklyDates(2, "2026-11-21", "2026-12-08", today)).toEqual({ success: false, error: "date-in-past" })
  expect(weeklyDates(3, "2026-11-23", "2026-11-24", today)).toEqual({ success: false, error: "no-dates" })
  expect(weeklyDates(1, "2026-11-23", "2026-13-01", today)).toEqual({ success: false, error: "invalid-date" })

  const last = "2027-05-17" // the 26th Monday from 2026-11-23
  expect(weeklyDates(1, "2026-11-23", last, today)).toMatchObject({ success: true })
  const full = weeklyDates(1, "2026-11-23", last, today)
  expect(full.success && full.data.length).toBe(MAX_SERIES_DATES)
  expect(weeklyDates(1, "2026-11-23", "2027-05-24", today)).toEqual({ success: false, error: "too-many-dates" })
})
