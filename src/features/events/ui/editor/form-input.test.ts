import { describe, expect, test } from "bun:test"
import { eventFormSchema, readEventForm } from "./form-input"

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.append(key, value)
  return data
}

function parse(values: Record<string, string>) {
  return eventFormSchema.parse(
    readEventForm(form({ type: "Gig", title: "Julkonsert", participationMode: "None", ...values }))
  )
}

describe("the Event form", () => {
  test("keeps the call time of an all-day Event", () => {
    const input = parse({ allDay: "true", firstDay: "2026-12-24", lastDay: "2026-12-24", callTime: "2026-12-23T22:00" })
    expect(input.callTime?.toISOString()).toBe("2026-12-23T21:00:00.000Z")
  })

  test("passes a time the clock skips on as an invalid instant, for the module to refuse", () => {
    const input = parse({ allDay: "false", startsAt: "2027-03-28T02:30", endsAt: "2027-03-28T04:00" })
    if (input.schedule.allDay) throw new Error("Expected a timed schedule.")
    expect(Number.isNaN(input.schedule.startsAt.getTime())).toBe(true)
    expect(input.schedule.endsAt.toISOString()).toBe("2027-03-28T02:00:00.000Z")
  })
})
