import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import { user } from "@/core/db/schema/auth"
import {
  event,
  eventAttendance,
  eventRegistration,
  eventRegistrationAnswer,
  eventRegistrationQuestion,
  eventResponse
} from "@/core/db/schema/events"
import { groupMember, position, positionHolder, section } from "@/core/db/schema/org-structure"
import { createEvent } from "./events"
import { changeEventStatus } from "./lifecycle"
import { createEventsTestDatabase, eventInput, expectSuccess } from "./test-support"

const database = await createEventsTestDatabase()
let viewer: string | null = null
const access = database
  ? createAuthorization({
      database: database.db,
      readSession: async () => (viewer ? { user: { id: viewer } } : null)
    })
  : undefined
mock.module("@/core/authz", () => ({ AuthorizationDeniedError, forCurrentRequest: access?.forCurrentRequest }))
mock.module("@/core/db", () => ({ db: database?.db }))
const { getResponseDetails, getRegistrationDetails, getAttendance, recordAttendance } = await import(
  "./participation-access"
)
const { getCurrentEventPage, listCurrentUpcomingEvents } = await import("./calendar/query")

describe.skipIf(!database)("protected Event participation", () => {
  const t = database as NonNullable<typeof database>
  afterAll(t.drop)
  const ids: Record<string, string> = {}
  beforeAll(async () => {
    for (const name of ["member", "manager", "parent", "stranger", "admin"]) ids[name] = await t.user(name)
    await t.db.update(user).set({ role: "admin" }).where(eq(user.id, ids.admin))
    ids.choir = await t.choir()
    ids.section = await t.group("Section", ids.choir)
    await t.db.insert(section).values({ groupId: ids.section, voice: "B" })
    ids.organiser = await t.group("Board")
    ids.managerRole = await t.representative(ids.manager, ids.organiser)
    await t.db.insert(groupMember).values([
      { userId: ids.member, groupId: ids.section, voice: "B1", startDate: "2020-01-01", endDate: "2026-10-02" },
      { userId: ids.parent, groupId: ids.section, voice: "B2", startDate: "2020-01-01" }
    ])
    const [parentRole] = await t.db.insert(position).values({ name: "Stämförälder", code: "stamforalder" }).returning()
    ids.parentRole = parentRole.id
    await t.db
      .insert(positionHolder)
      .values({ userId: ids.parent, groupId: ids.section, positionId: ids.parentRole, startDate: "2026-11-01" })
    for (const type of ["Rehearsal", "Concert", "Gig", "Social"] as const) {
      const stored = expectSuccess(
        await createEvent(t.db, {
          ...eventInput({
            type,
            organiserGroupId: ids.organiser,
            participationMode: type === "Social" ? "Registration" : "ResponseRequired",
            schedule: { allDay: false, startsAt: new Date("2026-10-01T16:00Z"), endsAt: new Date("2026-10-03T16:00Z") },
            targets: [{ groupId: ids.section, voiceFamily: null }]
          }),
          createdBy: ids.manager
        })
      )
      ids[type] = stored.id
      expectSuccess(await changeEventStatus(t.db, stored.id, "Published"))
    }
    const [response] = await t.db
      .insert(eventResponse)
      .values({
        eventId: ids.Rehearsal,
        userId: ids.member,
        answer: "No",
        reasonText: "Private reason",
        comment: "Private comment"
      })
      .returning()
    ids.response = response.id
    const [registration] = await t.db
      .insert(eventRegistration)
      .values({ eventId: ids.Social, userId: ids.member, comment: "Private registration" })
      .returning()
    ids.registration = registration.id
    const [question] = await t.db
      .insert(eventRegistrationQuestion)
      .values({ eventId: ids.Social, kind: "Text", label: "Diet", sortOrder: 0 })
      .returning()
    await t.db
      .insert(eventRegistrationAnswer)
      .values({ registrationId: registration.id, questionId: question.id, text: "Private allergy" })
  })

  test("response/registration data is self, Admin and current manager only, never a Section-parent grant", async () => {
    for (const name of ["member", "admin", "manager"]) {
      viewer = ids[name]
      expect(await getResponseDetails(ids.response)).toMatchObject({ reasonText: "Private reason" })
      expect(await getRegistrationDetails(ids.registration)).toMatchObject({
        answers: [expect.objectContaining({ text: "Private allergy" })]
      })
    }
    for (const name of ["parent", "stranger"]) {
      viewer = ids[name]
      expect(await getResponseDetails(ids.response)).toBeNull()
      expect(await getRegistrationDetails(ids.registration)).toBeNull()
    }
    await t.db
      .update(positionHolder)
      .set({ endDate: "2026-11-16" })
      .where(eq(positionHolder.positionId, ids.managerRole))
    viewer = ids.manager
    expect(await getResponseDetails(ids.response)).toBeNull()
    await t.db.update(positionHolder).set({ endDate: null }).where(eq(positionHolder.positionId, ids.managerRole))
  })

  test("current Section parent records and corrects historical Rehearsal/Concert attendance, with fresh attribution", async () => {
    // A rename changes no grant; code, current holding and exact Section are authoritative.
    await t.db.update(position).set({ name: "Renamed Section parent" }).where(eq(position.id, ids.parentRole))
    viewer = ids.parent
    for (const type of ["Rehearsal", "Concert"]) {
      const saved = await recordAttendance({ eventId: ids[type], userId: ids.member, status: "Present" })
      expect(saved).toMatchObject({ recordedBy: ids.parent, status: "Present" })
      const corrected = await recordAttendance({ eventId: ids[type], userId: ids.member, status: "Excused" })
      expect(corrected.id).toBe(saved.id)
      expect(await getAttendance(saved.id)).toMatchObject({ status: "Excused" })
      viewer = ids.member
      expect(await getAttendance(saved.id)).toMatchObject({ status: "Excused" })
      await expect(
        recordAttendance({ eventId: ids[type], userId: ids.member, status: "Absent" })
      ).rejects.toBeInstanceOf(AuthorizationDeniedError)
      viewer = ids.parent
    }
    await expect(recordAttendance({ eventId: ids.Gig, userId: ids.member, status: "Present" })).rejects.toBeInstanceOf(
      AuthorizationDeniedError
    )
    await expect(
      recordAttendance({ eventId: ids.Social, userId: ids.member, status: "Present" })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)
    viewer = ids.admin
    const gig = await recordAttendance({ eventId: ids.Gig, userId: ids.member, status: "Present" })
    viewer = ids.parent
    expect(await getAttendance(gig.id)).toBeNull()
    await t.db
      .update(positionHolder)
      .set({ endDate: "2026-11-16" })
      .where(eq(positionHolder.positionId, ids.parentRole))
    const [attendance] = await t.db.select().from(eventAttendance).where(eq(eventAttendance.eventId, ids.Concert))
    expect(await getAttendance(attendance.id)).toBeNull()
    await expect(
      recordAttendance({ eventId: ids.Concert, userId: ids.member, status: "Present" })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await t.db.update(positionHolder).set({ endDate: null }).where(eq(positionHolder.positionId, ids.parentRole))
  })

  test("calendar list/detail agree at start, future departure is immediate, and protected reads reject deactivated/anonymous callers", async () => {
    viewer = ids.member
    expect(await getCurrentEventPage(ids.Rehearsal, new Date("2026-09-30"))).toBeNull()
    expect((await listCurrentUpcomingEvents(new Date("2026-09-30"))).events).toEqual([])
    expect(await getCurrentEventPage(ids.Rehearsal, new Date("2026-10-01T16:00Z"))).toMatchObject({ id: ids.Rehearsal })
    expect((await listCurrentUpcomingEvents(new Date("2026-10-02T18:00Z"))).events.map(({ id }) => id)).toContain(
      ids.Rehearsal
    )
    expect(await getCurrentEventPage(ids.Rehearsal, new Date("2026-10-04"))).toMatchObject({ id: ids.Rehearsal })
    await t.db.update(event).set({ status: "Cancelled" }).where(eq(event.id, ids.Concert))
    viewer = ids.admin
    await expect(
      recordAttendance({ eventId: ids.Concert, userId: ids.member, status: "Present" })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await t.db.update(user).set({ banned: true }).where(eq(user.id, ids.admin))
    expect(await getResponseDetails(ids.response)).toBeNull()
    await expect(getCurrentEventPage(ids.Rehearsal, new Date())).rejects.toBeInstanceOf(AuthorizationDeniedError)
    viewer = null
    expect(await getRegistrationDetails(ids.registration)).toBeNull()
    await expect(
      recordAttendance({ eventId: ids.Rehearsal, userId: ids.member, status: "Present" })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)
  })
})
