import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createChoir, createGroup, endMembership, placeSinger, startMembership } from "@/features/org-structure"
import type { OrgStructureResult } from "@/features/org-structure/model"
import { createEvent, type EventInput } from "../events"
import { changeEventStatus } from "../lifecycle"
import { stockholmInstant } from "../model"
import { createEventsTestDatabase, expectSuccess } from "../test-support"
import { getEventPage, listUpcomingEventsForUser } from "./query"

// The calendar reads against a real database. The groups and Memberships come from the
// org-structure module's own commands, the Events from this module's, so both modules' rules hold.

const database = await createEventsTestDatabase()

const at = (value: string) => stockholmInstant(value) as Date
const NOW = at("2026-10-19T12:00")

function ok<T>(result: OrgStructureResult<T>): T {
  if (!result.success) throw new Error(`Expected success, got violation "${result.error}".`)
  return result.data
}

describe.skipIf(!database)("calendar reads", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  const groups: Record<string, string> = {}
  const users: Record<string, string> = {}

  beforeAll(async () => {
    const kk = ok(
      await createChoir(t.db, {
        name: "KK",
        sections: [
          { name: "KKS", voice: "S" },
          { name: "KKA", voice: "A" },
          { name: "KKT", voice: "T" },
          { name: "KKB", voice: "B" }
        ]
      })
    )
    const mk = ok(
      await createChoir(t.db, {
        name: "MK",
        sections: [
          { name: "MKT1", voice: "T1" },
          { name: "MKT2", voice: "T2" },
          { name: "MKB1", voice: "B1" },
          { name: "MKB2", voice: "B2" }
        ]
      })
    )
    groups.KK = kk.choirId
    groups.MK = mk.choirId
    for (const section of [...kk.sections, ...mk.sections]) groups[section.name] = section.id
    groups.Alumnikväll = ok(await createGroup(t.db, { name: "Alumnikväll", type: "GigGroup" })).id
    groups.Gigmästeri = ok(await createGroup(t.db, { name: "Gigmästeri", type: "Gigmästeri" })).id

    // Olof sings B1 in KK, Maja S2 in KK, Erik B2 in MK and plays the gig; Lucas left KK last week,
    // Sara joins MK next month, and Admin belongs to no group at all.
    for (const name of ["Olof", "Maja", "Erik", "Lucas", "Sara", "Admin"]) users[name] = await t.user(name)
    const place = (name: string, choir: string, voice: "B1" | "B2" | "S2" | "T1", startDate = "2025-08-20") =>
      placeSinger(t.db, { userId: users[name] as string, choirId: groups[choir] as string, voice, startDate })
    ok(await place("Olof", "KK", "B1"))
    ok(await place("Maja", "KK", "S2"))
    ok(await place("Erik", "MK", "B2"))
    ok(
      await startMembership(t.db, {
        userId: users.Erik as string,
        groupId: groups.Alumnikväll as string,
        startDate: "2026-09-01"
      })
    )
    ok(await place("Lucas", "KK", "B1", "2023-08-20"))
    ok(
      await endMembership(t.db, { userId: users.Lucas as string, groupId: groups.KK as string, endDate: "2026-10-16" })
    )
    ok(await place("Sara", "MK", "T1", "2026-11-01"))
  })

  async function event(input: Partial<EventInput> & { title: string }, status: "Draft" | "Published" | "Cancelled") {
    const { id } = expectSuccess(
      await createEvent(t.db, {
        type: "Meeting",
        schedule: { allDay: false, startsAt: at("2026-10-21T18:00"), endsAt: at("2026-10-21T21:00") },
        createdBy: null,
        ...input
      })
    )
    if (status !== "Draft") expectSuccess(await changeEventStatus(t.db, id, "Published"))
    if (status === "Cancelled") expectSuccess(await changeEventStatus(t.db, id, "Cancelled"))
    return id
  }

  const titlesFor = async (name: string, now = NOW) =>
    (await listUpcomingEventsForUser(t.db, users[name] as string, now)).events.map(({ title }) => title)

  describe("listUpcomingEventsForUser", () => {
    const ids: Record<string, string> = {}

    beforeAll(async () => {
      const kkTarget = { groupId: groups.KK as string, voiceFamily: null }
      ids.past = await event(
        {
          title: "Past rehearsal",
          type: "Rehearsal",
          schedule: { allDay: false, startsAt: at("2026-10-14T18:00"), endsAt: at("2026-10-14T21:00") },
          targets: [kkTarget]
        },
        "Published"
      )
      ids.ongoing = await event(
        {
          title: "Rephelg",
          type: "Rephelg",
          schedule: { allDay: true, firstDay: "2026-10-18", lastDay: "2026-10-19" },
          targets: [kkTarget]
        },
        "Published"
      )
      ids.extra = await event(
        {
          title: "Extra rehearsal",
          type: "Rehearsal",
          schedule: { allDay: false, startsAt: at("2026-10-24T10:00"), endsAt: at("2026-10-24T16:00") },
          targets: [kkTarget]
        },
        "Cancelled"
      )
      ids.draft = await event({ title: "Julkonsert", type: "Concert", targets: [kkTarget] }, "Draft")
      ids.sectional = await event(
        {
          title: "Bass sectional",
          type: "Rehearsal",
          schedule: { allDay: false, startsAt: at("2026-10-22T18:00"), endsAt: at("2026-10-22T20:00") },
          targets: [{ groupId: null, voiceFamily: "B" }]
        },
        "Published"
      )
      ids.gig = await event(
        {
          title: "Alumnikväll",
          type: "Gig",
          schedule: { allDay: false, startsAt: at("2026-11-14T17:00"), endsAt: at("2026-11-14T19:00") },
          targets: [{ groupId: groups.Alumnikväll as string, voiceFamily: null }]
        },
        "Published"
      )
      ids.korMote = await event(
        {
          title: "Körmöte",
          type: "Körmöte",
          schedule: { allDay: false, startsAt: at("2026-11-04T18:30"), endsAt: at("2026-11-04T20:00") }
        },
        "Published"
      )
    })

    test("lists the User's upcoming Published and Cancelled Events, ongoing ones first, never a Draft", async () => {
      expect(await titlesFor("Olof")).toEqual(["Rephelg", "Bass sectional", "Extra rehearsal", "Körmöte"])
      expect(await titlesFor("Maja")).toEqual(["Rephelg", "Extra rehearsal", "Körmöte"])
      expect(await titlesFor("Erik")).toEqual(["Bass sectional", "Körmöte", "Alumnikväll"])
    })

    test("an Event drops out once it has ended", async () => {
      expect(await titlesFor("Olof", at("2026-10-14T20:00"))).toContain("Past rehearsal")
      expect(await titlesFor("Olof", at("2026-10-20"))).not.toContain("Rephelg")
    })

    test("dated Memberships count on each Event's own date", async () => {
      // Lucas left KK on 16 October: the Rehearsal on the 14th was his, the Rephelg from the 18th is not.
      expect(await titlesFor("Lucas", at("2026-10-01"))).toEqual(["Past rehearsal"])
      expect(await titlesFor("Lucas")).toEqual([])
      // Sara joins MK on 1 November: the Körmöte after it is hers, the sectional before it is not.
      expect(await titlesFor("Sara")).toEqual(["Körmöte"])
    })

    test("someone in no Choir sees no Event for everyone, and is told why", async () => {
      expect(await listUpcomingEventsForUser(t.db, users.Admin as string, NOW)).toEqual({ events: [], inChoir: false })
      expect((await listUpcomingEventsForUser(t.db, users.Olof as string, NOW)).inChoir).toBe(true)
      expect((await listUpcomingEventsForUser(t.db, users.Sara as string, NOW)).inChoir).toBe(false)
    })

    test("labels Rehearsals by their derived kind, and other Events not at all", async () => {
      const { events } = await listUpcomingEventsForUser(t.db, users.Olof as string, NOW)
      expect(events.map(({ title, rehearsalKind, status }) => [title, rehearsalKind, status])).toEqual([
        ["Rephelg", null, "Published"],
        ["Bass sectional", "SectionalRehearsal", "Published"],
        ["Extra rehearsal", "ExtraRehearsal", "Cancelled"],
        ["Körmöte", null, "Published"]
      ])
    })
  })

  describe("getEventPage", () => {
    let gigId: string
    let draftId: string
    let socialId: string

    beforeAll(async () => {
      const responsible = users.Olof as string
      gigId = await event(
        {
          title: "Gig page",
          type: "Gig",
          locationText: "Kårhuset, the big hall",
          organiserGroupId: groups.Gigmästeri as string,
          callTime: at("2026-10-21T16:30"),
          gig: { responsibleUserId: responsible, contactName: "Eva Berg", contactDetails: "eva.berg@example.com" },
          targets: [{ groupId: groups.KK as string, voiceFamily: "B" }],
          details: [
            { label: "Dress code", value: "Kavaj" },
            { label: "Bring", value: "Music folder" }
          ]
        },
        "Published"
      )
      draftId = await event(
        { title: "Draft page", targets: [{ groupId: groups.KK as string, voiceFamily: null }] },
        "Draft"
      )
      socialId = await event(
        { title: "Sittning", type: "Social", social: { costInfo: "200 kr incl. food" } },
        "Cancelled"
      )
    })

    const viewer = (name: string, isAdmin = false) => ({ userId: users[name] as string, isAdmin })

    test("shows the Event to its Audience, without the Gig's external contact", async () => {
      const page = await getEventPage(t.db, gigId, viewer("Olof"))
      expect(page).toMatchObject({
        title: "Gig page",
        type: "Gig",
        rehearsalKind: null,
        status: "Published",
        locationText: "Kårhuset, the big hall",
        location: null,
        organiserGroup: "Gigmästeri",
        responsibleName: "Olof",
        leaderName: null,
        costInfo: null,
        details: [
          { label: "Dress code", value: "Kavaj" },
          { label: "Bring", value: "Music folder" }
        ],
        targets: [{ groupName: "KK", voiceFamily: "B" }]
      })
      expect(page?.callTime?.toISOString()).toBe(at("2026-10-21T16:30").toISOString())
      expect(JSON.stringify(page)).not.toContain("Eva Berg")
      expect(JSON.stringify(page)).not.toContain("eva.berg@example.com")
    })

    test("is not found outside the Audience, exactly like a missing Event, except for Admins", async () => {
      expect(await getEventPage(t.db, gigId, viewer("Maja"))).toBeNull()
      expect(await getEventPage(t.db, crypto.randomUUID(), viewer("Maja"))).toBeNull()
      expect(await getEventPage(t.db, "not-an-id", viewer("Maja"))).toBeNull()
      expect(await getEventPage(t.db, gigId, viewer("Admin", true))).not.toBeNull()
    })

    test("a Draft is not found by anyone, its Audience and Admins included", async () => {
      expect(await getEventPage(t.db, draftId, viewer("Olof"))).toBeNull()
      expect(await getEventPage(t.db, draftId, viewer("Admin", true))).toBeNull()
    })

    test("a Cancelled Social shows its status and cost to everyone in a Choir", async () => {
      expect(await getEventPage(t.db, socialId, viewer("Maja"))).toMatchObject({
        status: "Cancelled",
        costInfo: "200 kr incl. food",
        targets: []
      })
      expect(await getEventPage(t.db, socialId, viewer("Sara"))).toBeNull()
    })
  })
})
