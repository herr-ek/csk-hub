import { describe, expect, test } from "bun:test"
import { registerDom } from "@test/dom"
import type { EventFormValues } from "./query"
import { eventFormVersion, parseStoredEvent, snapshotEventForm } from "./unsaved-event"

registerDom()

const SAVED: EventFormValues = {
  type: "Gig",
  title: "Alumnikväll",
  description: null,
  allDay: false,
  startsAt: "2026-11-14T17:00",
  endsAt: "2026-11-14T19:00",
  firstDay: "2026-11-14",
  lastDay: "2026-11-14",
  callTime: "",
  respondBy: "",
  participationMode: "ResponseRequired",
  locationId: "",
  locationText: "",
  organiserGroupId: "",
  leaderUserId: "",
  responsibleUserId: "",
  contactName: "Eva Berg",
  contactDetails: "",
  costInfo: "",
  targets: [],
  details: []
}

/** A form with these fields, in this order, as the Event form renders them. */
function form(fields: Record<string, string>) {
  const element = document.createElement("form")
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input")
    input.name = name
    input.value = value
    element.appendChild(input)
  }
  return element
}

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }]
})

describe("the Event form's unsaved copy", () => {
  test("reads what the form shows, keeping fields it hides from before", () => {
    const snapshot = snapshotEventForm(
      form({
        type: "Rehearsal",
        title: "KK rehearsal",
        description: JSON.stringify(paragraph("Bring water")),
        allDay: "false",
        startsAt: "2026-10-21T18:00",
        endsAt: "2026-10-21T21:00",
        participationMode: "ResponseRequiredStrict",
        "target.r1.groupId": "kk",
        "target.r1.voiceFamily": "B",
        "detail.r3.label": "Bring",
        "detail.r3.value": "Water",
        "detail.r0.label": "Dress code",
        "detail.r0.value": "Kavaj"
      }),
      SAVED
    )
    expect(snapshot).toMatchObject({
      type: "Rehearsal",
      title: "KK rehearsal",
      description: paragraph("Bring water"),
      startsAt: "2026-10-21T18:00",
      participationMode: "ResponseRequiredStrict",
      targets: [{ groupId: "kk", voiceFamily: "B" }],
      // In the order the form shows them, not by their row keys.
      details: [
        { label: "Bring", value: "Water" },
        { label: "Dress code", value: "Kavaj" }
      ]
    })
    // A Rehearsal shows no Gig contact, so the one typed before survives a switch back.
    expect(snapshot.contactName).toBe("Eva Berg")
  })

  test("survives storage: a copy reads back as the same form values", () => {
    const values = { ...SAVED, description: paragraph("Kavaj"), targets: [{ groupId: "kk", voiceFamily: "" }] }
    expect(parseStoredEvent(JSON.parse(JSON.stringify(values)))).toEqual(values)
  })

  test("throws away a copy this form could not have written", () => {
    expect(parseStoredEvent(null)).toBeNull()
    expect(parseStoredEvent({ ...SAVED, type: "Picnic" })).toBeNull()
    expect(parseStoredEvent({ ...SAVED, participationMode: undefined })).toBeNull()
  })

  test("tells versions of the saved Event apart by their content", () => {
    expect(eventFormVersion(SAVED)).toBe(eventFormVersion({ ...SAVED }))
    expect(eventFormVersion(SAVED)).not.toBe(eventFormVersion({ ...SAVED, title: "Alumnikväll 2" }))
  })
})
