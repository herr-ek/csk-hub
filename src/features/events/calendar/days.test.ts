import { describe, expect, test } from "bun:test"
import { stockholmInstant } from "../model"
import { eventDays, groupByDay, happensOn } from "./days"

const at = (value: string) => stockholmInstant(value) as Date

describe("eventDays", () => {
  test("a timed Event on one day", () => {
    expect(eventDays({ startsAt: at("2026-10-21T18:00"), endsAt: at("2026-10-21T21:00") })).toEqual({
      firstDay: "2026-10-21",
      lastDay: "2026-10-21"
    })
  })

  test("a timed Event past midnight ends the next day; one ending at midnight does not", () => {
    expect(eventDays({ startsAt: at("2026-11-20T18:00"), endsAt: at("2026-11-21T01:00") }).lastDay).toBe("2026-11-21")
    expect(eventDays({ startsAt: at("2026-11-20T18:00"), endsAt: at("2026-11-21") }).lastDay).toBe("2026-11-20")
  })

  test("an all-day Event ends on the day before its closing midnight", () => {
    expect(eventDays({ startsAt: at("2026-12-24"), endsAt: at("2026-12-26") })).toEqual({
      firstDay: "2026-12-24",
      lastDay: "2026-12-25"
    })
    expect(eventDays({ startsAt: at("2026-12-24"), endsAt: at("2026-12-25") })).toEqual({
      firstDay: "2026-12-24",
      lastDay: "2026-12-24"
    })
  })

  test("all-day Events across a daylight saving change keep their days", () => {
    // Summer time ends at 03:00 on 25 October and starts at 02:00 on 29 March.
    expect(eventDays({ startsAt: at("2026-10-24"), endsAt: at("2026-10-26") })).toEqual({
      firstDay: "2026-10-24",
      lastDay: "2026-10-25"
    })
    expect(eventDays({ startsAt: at("2026-03-28"), endsAt: at("2026-03-30") })).toEqual({
      firstDay: "2026-03-28",
      lastDay: "2026-03-29"
    })
    expect(eventDays({ startsAt: at("2026-10-25"), endsAt: at("2026-10-26") })).toEqual({
      firstDay: "2026-10-25",
      lastDay: "2026-10-25"
    })
  })
})

describe("groupByDay", () => {
  test("groups by the Stockholm start day, then by month, in the given order", () => {
    const events = [
      { id: "late", startsAt: at("2026-10-31T23:30") },
      { id: "first", startsAt: at("2026-11-01T00:15") },
      { id: "second", startsAt: at("2026-11-01T18:00") },
      { id: "next", startsAt: at("2026-11-03T18:00") }
    ]
    expect(
      groupByDay(events).map(({ month, days }) => ({
        month,
        days: days.map(({ day, events }) => [day, events.map(({ id }) => id)])
      }))
    ).toEqual([
      { month: "2026-10", days: [["2026-10-31", ["late"]]] },
      {
        month: "2026-11",
        days: [
          ["2026-11-01", ["first", "second"]],
          ["2026-11-03", ["next"]]
        ]
      }
    ])
  })

  test("nothing upcoming is no months", () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe("happensOn", () => {
  test("a timed Event happens on its own day only", () => {
    const rehearsal = { startsAt: at("2026-10-21T18:00"), endsAt: at("2026-10-21T21:00") }
    expect(happensOn(rehearsal, "2026-10-21")).toBe(true)
    expect(happensOn(rehearsal, "2026-10-20")).toBe(false)
    expect(happensOn(rehearsal, "2026-10-22")).toBe(false)
  })

  test("a multi-day Event happens on every day it covers, and not after its closing midnight", () => {
    const tour = { startsAt: at("2026-12-24"), endsAt: at("2026-12-26") }
    expect(happensOn(tour, "2026-12-24")).toBe(true)
    expect(happensOn(tour, "2026-12-25")).toBe(true)
    expect(happensOn(tour, "2026-12-26")).toBe(false)
  })
})
