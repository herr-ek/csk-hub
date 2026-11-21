import { describe, expect, test } from "bun:test"
import { completeTime, followStart, maskTime, stepTime } from "./date-time"

/** Types `keys` one at a time into an empty time box. */
function type(keys: string) {
  let text = ""
  for (const key of keys) text = maskTime(text + key, text, false)
  return text
}

describe("time mask", () => {
  test("adds the colon once the hour is complete", () => {
    expect(type("18")).toBe("18:")
    expect(type("1830")).toBe("18:30")
    expect(maskTime("18:30", "", false)).toBe("18:30")
  })

  test("gives a one-digit hour its leading zero", () => {
    expect(type("9")).toBe("09:")
    expect(type("945")).toBe("09:45")
  })

  test("drops keystrokes that cannot make a real time", () => {
    expect(type("25")).toBe("2")
    expect(type("1871")).toBe("18:1")
    expect(type("18307")).toBe("18:30")
  })

  test("lets the colon go when deleting", () => {
    expect(maskTime("18", "18:", true)).toBe("18")
  })

  test("completes partly typed times on leaving the box", () => {
    expect(completeTime("9")).toBe("09:00")
    expect(completeTime("18:")).toBe("18:00")
    expect(completeTime("18:3")).toBe("18:30")
    expect(completeTime("")).toBe("")
    expect(completeTime("24:00")).toBeNull()
  })

  test("steps around midnight", () => {
    expect(stepTime("23:50", 15)).toBe("00:05")
    expect(stepTime("00:00", -15)).toBe("23:45")
  })
})

describe("end following the start", () => {
  test("keeps the length when the start moves", () => {
    expect(followStart("2026-12-06T19:00", "2026-12-07T18:30", "2026-12-06T21:30", 120)).toBe("2026-12-07T21:00")
    expect(followStart("2026-12-06", "2026-12-10", "2026-12-08", 0)).toBe("2026-12-12")
  })

  test("fills a missing end from the default length", () => {
    expect(followStart("", "2026-12-06T23:00", "", 120)).toBe("2026-12-07T01:00")
    expect(followStart("", "2026-12-06", "", 0)).toBe("2026-12-06")
  })

  test("ignores daylight saving", () => {
    expect(followStart("2026-03-28T19:00", "2026-03-29T19:00", "2026-03-28T21:30", 120)).toBe("2026-03-29T21:30")
  })

  test("leaves the end alone without a start to measure from", () => {
    expect(followStart("", "2026-12-06T19:00", "2026-12-06T22:00", 120)).toBe("2026-12-06T22:00")
    expect(followStart("2026-12-06T19:00", "", "2026-12-06T22:00", 120)).toBe("2026-12-06T22:00")
  })
})
