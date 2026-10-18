import { describe, expect, test } from "bun:test"
import { addDays, isIsoDate, stockholmDate, stockholmInstant, stockholmLocalDateTime } from "./stockholm-time"

describe("Stockholm time", () => {
  test("reads a wall-clock time in winter and in summer", () => {
    expect(stockholmInstant("2026-12-24T18:00")?.toISOString()).toBe("2026-12-24T17:00:00.000Z")
    expect(stockholmInstant("2026-07-01T18:00")?.toISOString()).toBe("2026-07-01T16:00:00.000Z")
  })

  test("reads a date as its midnight, on either side of a daylight saving change", () => {
    expect(stockholmInstant("2026-03-29")?.toISOString()).toBe("2026-03-28T23:00:00.000Z")
    expect(stockholmInstant("2026-03-30")?.toISOString()).toBe("2026-03-29T22:00:00.000Z")
    expect(stockholmInstant("2026-10-25")?.toISOString()).toBe("2026-10-24T22:00:00.000Z")
    expect(stockholmInstant("2026-10-26")?.toISOString()).toBe("2026-10-25T23:00:00.000Z")
  })

  test("refuses values that are not real dates or times", () => {
    expect(stockholmInstant("2026-02-31")).toBeNull()
    expect(stockholmInstant("2026-10-07T24:00")).toBeNull()
    expect(stockholmInstant("7 Oct")).toBeNull()
    expect(isIsoDate("2026-13-01")).toBe(false)
  })

  test("round-trips an instant to its Stockholm date and wall clock", () => {
    const instant = new Date("2026-12-25T23:30:00Z")
    expect(stockholmDate(instant)).toBe("2026-12-26")
    expect(stockholmLocalDateTime(instant)).toBe("2026-12-26T00:30")
    expect(stockholmInstant(stockholmLocalDateTime(instant))?.toISOString()).toBe(instant.toISOString())
  })

  test("adds days across a month and a year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
})
