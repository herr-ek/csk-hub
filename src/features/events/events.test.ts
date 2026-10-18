import { afterAll, describe, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import {
  event,
  eventDetail,
  eventResponse,
  eventTarget,
  gig,
  location,
  rehearsal,
  socialEvent
} from "@/core/db/schema/events"
import { createEvent, updateEvent } from "./events"
import { changeEventStatus } from "./lifecycle"
import { archiveLocation, createLocation } from "./locations"
import { EVENT_TYPES, type EventType, type ParticipationMode, stockholmDate } from "./model"
import { createEventsTestDatabase, eventInput, expectSuccess, uniqueName } from "./test-support"

const database = await createEventsTestDatabase()

describe.skipIf(!database)("Events commands", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function eventRow(id: string) {
    const [row] = await t.db.select().from(event).where(eq(event.id, id))
    if (!row) throw new Error("No such Event.")
    return row
  }

  async function extensionsOf(id: string) {
    const [rehearsals, gigs, socials] = await Promise.all([
      t.db.select().from(rehearsal).where(eq(rehearsal.eventId, id)),
      t.db.select().from(gig).where(eq(gig.eventId, id)),
      t.db.select().from(socialEvent).where(eq(socialEvent.eventId, id))
    ])
    return { rehearsals, gigs, socials }
  }

  async function newLocation() {
    return expectSuccess(await createLocation(t.db, { name: uniqueName("Hall") })).id
  }

  describe("createEvent", () => {
    test("creates a Draft of every type, with an extension row exactly for Rehearsal, Gig and Social", async () => {
      const creator = await t.user("Admin")
      for (const type of EVENT_TYPES) {
        const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ type }), createdBy: creator }))
        expect(await eventRow(id)).toMatchObject({ type, status: "Draft", createdBy: creator })
        const { rehearsals, gigs, socials } = await extensionsOf(id)
        expect([rehearsals.length, gigs.length, socials.length]).toEqual([
          type === "Rehearsal" ? 1 : 0,
          type === "Gig" ? 1 : 0,
          type === "Social" ? 1 : 0
        ])
      }
    })

    test("defaults the Participation mode by type, and keeps an override", async () => {
      const defaults: [EventType, ParticipationMode][] = [
        ["Rehearsal", "ResponseRequiredStrict"],
        ["Concert", "ResponseRequiredStrict"],
        ["Gig", "ResponseRequired"],
        ["Körmöte", "ResponseRequired"],
        ["Social", "Registration"],
        ["Rephelg", "Registration"],
        ["Booking", "None"],
        ["Meeting", "None"],
        ["Other", "None"]
      ]
      for (const [type, mode] of defaults) {
        const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ type }), createdBy: null }))
        expect((await eventRow(id)).participationMode).toBe(mode)
      }

      const { id } = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({ type: "Rehearsal", participationMode: "ResponseRequired" }),
          createdBy: null
        })
      )
      expect((await eventRow(id)).participationMode).toBe("ResponseRequired")
    })

    test("writes the extension fields of the type", async () => {
      const [leader, responsible] = [await t.user("Olof"), await t.user("Olof")]
      const rehearsalId = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({ type: "Rehearsal", rehearsal: { leaderUserId: leader } }),
          createdBy: null
        })
      ).id
      expect((await extensionsOf(rehearsalId)).rehearsals).toEqual([
        { eventId: rehearsalId, type: "Rehearsal", leaderUserId: leader }
      ])

      const gigId = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({
            type: "Gig",
            gig: { responsibleUserId: responsible, contactName: " Eva Berg ", contactDetails: "" }
          }),
          createdBy: null
        })
      ).id
      expect((await extensionsOf(gigId)).gigs).toEqual([
        { eventId: gigId, type: "Gig", responsibleUserId: responsible, contactName: "Eva Berg", contactDetails: null }
      ])

      const socialId = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({ type: "Social", social: { costInfo: "200 kr incl. food" } }),
          createdBy: null
        })
      ).id
      expect((await extensionsOf(socialId)).socials).toEqual([
        { eventId: socialId, type: "Social", costInfo: "200 kr incl. food" }
      ])
    })

    test("refuses a leader or responsible User who does not exist", async () => {
      expect(
        await createEvent(t.db, {
          ...eventInput({ type: "Rehearsal", rehearsal: { leaderUserId: "nobody" } }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "user-not-found" })
    })

    test("stores an all-day Event from 00:00 on the first day to 00:00 after the last, in Stockholm", async () => {
      const { id } = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({ schedule: { allDay: true, firstDay: "2026-12-24", lastDay: "2026-12-25" } }),
          createdBy: null
        })
      )
      const row = await eventRow(id)
      expect(row.allDay).toBe(true)
      expect(row.startsAt.toISOString()).toBe("2026-12-23T23:00:00.000Z")
      expect(row.endsAt.toISOString()).toBe("2026-12-25T23:00:00.000Z")
      expect([stockholmDate(row.startsAt), stockholmDate(row.endsAt)]).toEqual(["2026-12-24", "2026-12-26"])
    })

    test("stores the description through the Events document schema, and an empty one as null", async () => {
      const paragraph = (text: string, marks?: { type: string; attrs?: object }[]) => ({
        type: "paragraph",
        content: [{ type: "text", text, ...(marks ? { marks } : {}) }]
      })
      const description = {
        type: "doc",
        content: [
          paragraph("Bring water", [{ type: "bold" }, { type: "strike" }]),
          paragraph("Map", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])
        ]
      }
      const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ description }), createdBy: null }))
      // What the Events schema does not know is dropped, and the words stay.
      expect((await eventRow(id)).description).toEqual({
        type: "doc",
        content: [paragraph("Bring water", [{ type: "bold" }]), paragraph("Map")]
      })

      const empty = { type: "doc", content: [{ type: "paragraph" }] }
      const blank = expectSuccess(await createEvent(t.db, { ...eventInput({ description: empty }), createdBy: null }))
      expect((await eventRow(blank.id)).description).toBeNull()
    })

    test("refuses a description with words the Events schema cannot hold, rather than losing them", async () => {
      // Events allow no headings, and a heading's words cannot stand loose in the document.
      const description = {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Programme" }] }]
      }
      expect(await createEvent(t.db, { ...eventInput({ description }), createdBy: null })).toEqual({
        success: false,
        error: "description-invalid"
      })
    })

    test("passes every timing rule the database checks through as a typed violation", async () => {
      const startsAt = new Date("2026-11-03T17:00:00Z")
      const timed = (endsAt: Date) => ({ allDay: false as const, startsAt, endsAt })
      const later = new Date("2026-11-03T18:00:00Z")

      expect(await createEvent(t.db, { ...eventInput({ schedule: timed(startsAt) }), createdBy: null })).toEqual({
        success: false,
        error: "ends-before-start"
      })
      expect(
        await createEvent(t.db, {
          ...eventInput({ schedule: { allDay: true, firstDay: "2026-12-25", lastDay: "2026-12-23" } }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "ends-before-start" })
      expect(
        await createEvent(t.db, {
          ...eventInput({ schedule: { allDay: true, firstDay: "2026-02-30", lastDay: "2026-03-01" } }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "invalid-date" })
      expect(await createEvent(t.db, { ...eventInput({ callTime: later }), createdBy: null })).toEqual({
        success: false,
        error: "call-time-after-start"
      })
      expect(
        await createEvent(t.db, {
          ...eventInput({ participationMode: "ResponseRequired", respondBy: later }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "respond-by-after-start" })
      expect(
        await createEvent(t.db, {
          ...eventInput({ participationMode: "None", respondBy: new Date("2026-11-01T12:00:00Z") }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "respond-by-without-participation" })
      expect(await createEvent(t.db, { ...eventInput({ title: "   " }), createdBy: null })).toEqual({
        success: false,
        error: "title-required"
      })
    })

    test("refuses an archived Location or Organiser group", async () => {
      const locationId = await newLocation()
      expectSuccess(await archiveLocation(t.db, locationId))
      expect(await createEvent(t.db, { ...eventInput({ locationId }), createdBy: null })).toEqual({
        success: false,
        error: "location-archived"
      })

      const board = await t.group("Board")
      await t.archiveGroup(board)
      expect(await createEvent(t.db, { ...eventInput({ organiserGroupId: board }), createdBy: null })).toEqual({
        success: false,
        error: "organiser-group-archived"
      })
      expect(
        await createEvent(t.db, { ...eventInput({ organiserGroupId: crypto.randomUUID() }), createdBy: null })
      ).toEqual({ success: false, error: "organiser-group-not-found" })
    })
  })

  describe("Targets", () => {
    test("express each typical shape: a Choir, a Section, a Voice family, both, a gig group", async () => {
      const kk = await t.choir()
      const kkb = await t.group("Section", kk)
      const gigGroup = await t.group("GigGroup")
      const shapes = [
        { groupId: kk, voiceFamily: null },
        { groupId: kkb, voiceFamily: null },
        { groupId: null, voiceFamily: "B" as const },
        { groupId: kk, voiceFamily: "B" as const },
        { groupId: gigGroup, voiceFamily: null }
      ]
      for (const target of shapes) {
        const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ targets: [target] }), createdBy: null }))
        const rows = await t.db
          .select({ groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
          .from(eventTarget)
          .where(eq(eventTarget.eventId, id))
        expect(rows).toEqual([target])
      }
    })

    test("refuses an empty, duplicated or archived Target", async () => {
      const kk = await t.choir()
      expect(
        await createEvent(t.db, { ...eventInput({ targets: [{ groupId: null, voiceFamily: null }] }), createdBy: null })
      ).toEqual({ success: false, error: "target-empty" })
      expect(
        await createEvent(t.db, {
          ...eventInput({
            targets: [
              { groupId: kk, voiceFamily: "B" },
              { groupId: kk, voiceFamily: "B" }
            ]
          }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "target-duplicate" })

      const archived = await t.group("GigGroup")
      await t.archiveGroup(archived)
      expect(
        await createEvent(t.db, {
          ...eventInput({ targets: [{ groupId: archived, voiceFamily: null }] }),
          createdBy: null
        })
      ).toEqual({ success: false, error: "target-group-archived" })
    })
  })

  describe("updateEvent", () => {
    test("turns a Rehearsal into a Gig, replacing the extension row", async () => {
      const leader = await t.user()
      const { id } = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({ type: "Rehearsal", rehearsal: { leaderUserId: leader } }),
          createdBy: null
        })
      )
      expectSuccess(
        await updateEvent(
          t.db,
          id,
          eventInput({ type: "Gig", gig: { contactName: "Eva Berg" }, rehearsal: { leaderUserId: leader } })
        )
      )
      expect((await eventRow(id)).type).toBe("Gig")
      const { rehearsals, gigs, socials } = await extensionsOf(id)
      expect(rehearsals).toEqual([])
      expect(socials).toEqual([])
      expect(gigs).toEqual([
        { eventId: id, type: "Gig", responsibleUserId: null, contactName: "Eva Berg", contactDetails: null }
      ])
    })

    test("leaves the Event as it was when the change is refused", async () => {
      const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ type: "Rehearsal" }), createdBy: null }))
      expect(await updateEvent(t.db, id, eventInput({ type: "Gig", title: "" }))).toEqual({
        success: false,
        error: "title-required"
      })
      expect((await eventRow(id)).type).toBe("Rehearsal")
      expect((await extensionsOf(id)).rehearsals).toHaveLength(1)
    })

    test("keeps Event details in their order across saves", async () => {
      const details = [
        { label: "Dress code", value: "Kavaj" },
        { label: "Bring", value: "Music folder and water" },
        { label: "Entrance", value: "Use the courtyard door" }
      ]
      const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ details }), createdBy: null }))
      const read = async () =>
        t.db
          .select({ label: eventDetail.label, value: eventDetail.value })
          .from(eventDetail)
          .where(eq(eventDetail.eventId, id))
          .orderBy(asc(eventDetail.sortOrder))
      expect(await read()).toEqual(details)

      const reordered = [details[2], details[0]] as typeof details
      expectSuccess(await updateEvent(t.db, id, eventInput({ details: reordered })))
      expect(await read()).toEqual(reordered)
      expectSuccess(await updateEvent(t.db, id, eventInput({ details: reordered })))
      expect(await read()).toEqual(reordered)

      expect(await updateEvent(t.db, id, eventInput({ details: [{ label: "Bring", value: " " }] }))).toEqual({
        success: false,
        error: "detail-incomplete"
      })
    })

    test("replaces the Targets as a set, keeping a group archived since", async () => {
      const kk = await t.choir()
      const gigGroup = await t.group("GigGroup")
      const { id } = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({ targets: [{ groupId: gigGroup, voiceFamily: null }] }),
          createdBy: null
        })
      )
      await t.archiveGroup(gigGroup)

      expectSuccess(
        await updateEvent(
          t.db,
          id,
          eventInput({
            targets: [
              { groupId: gigGroup, voiceFamily: null },
              { groupId: kk, voiceFamily: "T" }
            ]
          })
        )
      )
      const rows = await t.db
        .select({ groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
        .from(eventTarget)
        .where(eq(eventTarget.eventId, id))
      expect(rows).toHaveLength(2)

      expectSuccess(await updateEvent(t.db, id, eventInput({ targets: [] })))
      expect(await t.db.select().from(eventTarget).where(eq(eventTarget.eventId, id))).toEqual([])
    })

    test("keeps an archived Location the Event already had, but offers it to no other", async () => {
      const locationId = await newLocation()
      const { id } = expectSuccess(await createEvent(t.db, { ...eventInput({ locationId }), createdBy: null }))
      expectSuccess(await archiveLocation(t.db, locationId))

      expectSuccess(await updateEvent(t.db, id, eventInput({ locationId, title: "Renamed" })))
      expect((await eventRow(id)).locationId).toBe(locationId)

      const other = expectSuccess(await createEvent(t.db, { ...eventInput(), createdBy: null }))
      expect(await updateEvent(t.db, other.id, eventInput({ locationId }))).toEqual({
        success: false,
        error: "location-archived"
      })
      const [row] = await t.db.select({ active: location.active }).from(location).where(eq(location.id, locationId))
      expect(row?.active).toBe(false)
    })

    test("refuses a Participation mode that would strand Responses", async () => {
      const { id } = expectSuccess(
        await createEvent(t.db, { ...eventInput({ participationMode: "ResponseRequired" }), createdBy: null })
      )
      expectSuccess(await changeEventStatus(t.db, id, "Published"))
      await t.db.insert(eventResponse).values({ eventId: id, userId: await t.user(), answer: "Yes" })

      expect(await updateEvent(t.db, id, eventInput({ participationMode: "None" }))).toEqual({
        success: false,
        error: "participation-mode-locked"
      })
      // Between the two response modes nothing is stranded.
      expectSuccess(await updateEvent(t.db, id, eventInput({ participationMode: "ResponseRequiredStrict" })))
    })

    test("refuses an Event that does not exist", async () => {
      expect(await updateEvent(t.db, crypto.randomUUID(), eventInput())).toEqual({
        success: false,
        error: "event-not-found"
      })
    })
  })
})
