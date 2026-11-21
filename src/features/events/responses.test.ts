import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { absenceReason, event, eventResponse, eventTarget } from "@/core/db/schema/events"
import { directMembership } from "@/core/db/schema/org-structure"
import type { EventStatus, ParticipationMode } from "./model"
import {
  archiveAbsenceReason,
  createAbsenceReason,
  listActiveAudience,
  renameAbsenceReason,
  respondToEvent
} from "./responses"
import { createEventsTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createEventsTestDatabase()

const NOW = new Date("2026-10-01T10:00:00Z")
const STARTS_AT = new Date("2026-10-07T16:30:00Z")

describe.skipIf(!database)("Responses", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  let choirId: string
  let singer: string
  let outsider: string
  let sick: string

  beforeAll(async () => {
    choirId = await t.choir()
    singer = await t.user("Singer")
    outsider = await t.user("Outsider")
    await t.db.insert(directMembership).values({ userId: singer, groupId: choirId, startDate: "2020-01-01" })
    sick = expectSuccess(await createAbsenceReason(t.db, { label: uniqueName("Sick") })).id
  })

  /** An Event for the Choir, Published in the given mode unless told otherwise. */
  async function choirEvent(
    mode: ParticipationMode,
    { status = "Published", respondBy = null }: { status?: EventStatus; respondBy?: Date | null } = {}
  ) {
    const [row] = await t.db
      .insert(event)
      .values({
        type: "Concert",
        status,
        title: uniqueName("Concert"),
        startsAt: STARTS_AT,
        endsAt: new Date("2026-10-07T19:00:00Z"),
        participationMode: mode,
        respondBy
      })
      .returning({ id: event.id })
    if (!row) throw new Error("No Event created.")
    await t.db.insert(eventTarget).values({ eventId: row.id, groupId: choirId })
    return row.id
  }

  async function responsesTo(eventId: string) {
    return t.db.select().from(eventResponse).where(eq(eventResponse.eventId, eventId))
  }

  test("in ResponseRequired, takes any answer and replaces it, with a reason optional", async () => {
    const eventId = await choirEvent("ResponseRequired")
    expectSuccess(await respondToEvent(t.db, singer, eventId, { answer: "Maybe", comment: " Late train " }, NOW))
    expect(await responsesTo(eventId)).toMatchObject([{ answer: "Maybe", comment: "Late train", respondedAt: NOW }])

    const later = new Date("2026-10-02T10:00:00Z")
    expectSuccess(await respondToEvent(t.db, singer, eventId, { answer: "No" }, later))
    const [changed, ...others] = await responsesTo(eventId)
    expect(others).toEqual([])
    expect(changed).toMatchObject({ answer: "No", comment: null, absenceReasonId: null, respondedAt: later })
  })

  test("in ResponseRequiredStrict, takes Yes, or No with exactly one reason", async () => {
    const eventId = await choirEvent("ResponseRequiredStrict")
    const respond = (input: Parameters<typeof respondToEvent>[3]) => respondToEvent(t.db, singer, eventId, input, NOW)

    expect(await respond({ answer: "Maybe" })).toEqual({ success: false, error: "maybe-not-allowed" })
    expect(await respond({ answer: "No", reasonText: "  " })).toEqual({
      success: false,
      error: "absence-reason-required"
    })
    expect(await respond({ answer: "No", absenceReasonId: sick, reasonText: "Exam" })).toEqual({
      success: false,
      error: "absence-reason-conflict"
    })
    expect(await respond({ answer: "Yes", reasonText: "Exam" })).toEqual({
      success: false,
      error: "reason-only-with-no"
    })
    expect(await respond({ answer: "No", absenceReasonId: crypto.randomUUID() })).toEqual({
      success: false,
      error: "absence-reason-not-found"
    })
    expect(await responsesTo(eventId)).toEqual([])

    expectSuccess(await respond({ answer: "No", reasonText: "Moving apartment" }))
    expectSuccess(await respond({ answer: "No", absenceReasonId: sick }))
    expect(await responsesTo(eventId)).toMatchObject([{ answer: "No", absenceReasonId: sick, reasonText: null }])
  })

  test("refuses anyone outside the Audience", async () => {
    const eventId = await choirEvent("ResponseRequired")
    expect(await respondToEvent(t.db, outsider, eventId, { answer: "Yes" }, NOW)).toEqual({
      success: false,
      error: "not-in-audience"
    })
    expect(await respondToEvent(t.db, singer, crypto.randomUUID(), { answer: "Yes" }, NOW)).toEqual({
      success: false,
      error: "event-not-found"
    })
  })

  test("refuses Drafts, Cancelled Events and modes that collect no Responses", async () => {
    const closed = [
      await choirEvent("ResponseRequired", { status: "Draft" }),
      await choirEvent("ResponseRequired", { status: "Cancelled" }),
      await choirEvent("None"),
      await choirEvent("Registration")
    ]
    for (const eventId of closed) {
      expect(await respondToEvent(t.db, singer, eventId, { answer: "Yes" }, NOW)).toEqual({
        success: false,
        error: "responses-closed"
      })
    }
  })

  test("accepts a late Response and flags it, but refuses one once the Event has started", async () => {
    const eventId = await choirEvent("ResponseRequired", { respondBy: new Date("2026-09-30T21:59:00Z") })
    expect(expectSuccess(await respondToEvent(t.db, singer, eventId, { answer: "Yes" }, NOW))).toEqual({ late: true })
    expect(await respondToEvent(t.db, singer, eventId, { answer: "No" }, STARTS_AT)).toEqual({
      success: false,
      error: "event-started"
    })

    const onTime = await choirEvent("ResponseRequired", { respondBy: new Date("2026-10-05T21:59:00Z") })
    expect(expectSuccess(await respondToEvent(t.db, singer, onTime, { answer: "Yes" }, NOW))).toEqual({ late: false })
  })

  test("offers no archived reason, but keeps one a Response already has", async () => {
    const exam = expectSuccess(await createAbsenceReason(t.db, { label: uniqueName("Exam") })).id
    const keeping = await choirEvent("ResponseRequiredStrict")
    expectSuccess(await respondToEvent(t.db, singer, keeping, { answer: "No", absenceReasonId: exam }, NOW))
    expectSuccess(await archiveAbsenceReason(t.db, exam))

    const fresh = await choirEvent("ResponseRequiredStrict")
    expect(await respondToEvent(t.db, singer, fresh, { answer: "No", absenceReasonId: exam }, NOW)).toEqual({
      success: false,
      error: "absence-reason-archived"
    })
    expectSuccess(
      await respondToEvent(t.db, singer, keeping, { answer: "No", absenceReasonId: exam, comment: "Sorry" }, NOW)
    )
    expect(await responsesTo(keeping)).toMatchObject([{ absenceReasonId: exam, comment: "Sorry" }])
  })

  test("creates, renames and archives Absence reasons, unique among active ones", async () => {
    const label = uniqueName("Work")
    const { id } = expectSuccess(await createAbsenceReason(t.db, { label: ` ${label} ` }))
    expect(await createAbsenceReason(t.db, { label })).toEqual({ success: false, error: "absence-reason-label-taken" })
    expect(await createAbsenceReason(t.db, { label: " " })).toEqual({
      success: false,
      error: "absence-reason-label-required"
    })

    const renamed = uniqueName("Travelling")
    expectSuccess(await renameAbsenceReason(t.db, id, { label: renamed }))
    expectSuccess(await archiveAbsenceReason(t.db, id))
    const [row] = await t.db.select().from(absenceReason).where(eq(absenceReason.id, id))
    expect(row).toEqual({ id, label: renamed, active: false })
    expect(await renameAbsenceReason(t.db, id, { label })).toEqual({ success: false, error: "absence-reason-archived" })
    expect(await archiveAbsenceReason(t.db, crypto.randomUUID())).toEqual({
      success: false,
      error: "absence-reason-not-found"
    })
    expectSuccess(await createAbsenceReason(t.db, { label: renamed }))
  })

  test("lists the active Audience by the same rule, without Inactive Users", async () => {
    const leaver = await t.user("Leaver")
    await t.db.insert(directMembership).values({ userId: leaver, groupId: choirId, startDate: "2020-01-01" })
    await t.db.update(user).set({ banned: true }).where(eq(user.id, leaver))
    const later = await t.user("Joins after the Event")
    await t.db.insert(directMembership).values({ userId: later, groupId: choirId, startDate: "2026-10-08" })

    const eventId = await choirEvent("ResponseRequired")
    const ids = (await listActiveAudience(t.db, { id: eventId, startsAt: STARTS_AT }, NOW)).map(({ id }) => id)
    expect(ids).toContain(singer)
    expect(ids).not.toContain(outsider)
    expect(ids).not.toContain(leaver)
    expect(ids).not.toContain(later)

    // An Event with no Targets is for every active User.
    await t.db.delete(eventTarget).where(eq(eventTarget.eventId, eventId))
    const everyone = (await listActiveAudience(t.db, { id: eventId, startsAt: STARTS_AT }, NOW)).map(({ id }) => id)
    expect(everyone).toEqual(expect.arrayContaining([singer, outsider, later]))
    expect(everyone).not.toContain(leaver)
  })
})
