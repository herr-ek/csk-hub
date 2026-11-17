import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { event, eventAttendance, eventRegistration, eventResponse } from "@/core/db/schema/events"
import { createEvent } from "./events"
import { changeEventStatus, deleteEvent, getEventDeletionImpact } from "./lifecycle"
import { createEventsTestDatabase, eventInput, expectSuccess } from "./test-support"

const database = await createEventsTestDatabase()

describe.skipIf(!database)("Events lifecycle", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function statusOf(id: string) {
    const [row] = await t.db.select({ status: event.status }).from(event).where(eq(event.id, id))
    return row?.status
  }

  async function newDraft(overrides: Parameters<typeof eventInput>[0] = {}) {
    return expectSuccess(await createEvent(t.db, { ...eventInput(overrides), createdBy: null })).id
  }

  test("publishes a Draft, cancels it and reinstates it", async () => {
    const id = await newDraft()
    expectSuccess(await changeEventStatus(t.db, id, "Published"))
    expect(await statusOf(id)).toBe("Published")
    expectSuccess(await changeEventStatus(t.db, id, "Cancelled"))
    expect(await statusOf(id)).toBe("Cancelled")
    expectSuccess(await changeEventStatus(t.db, id, "Published"))
    expect(await statusOf(id)).toBe("Published")
  })

  test("never returns a Published Event to Draft, nor cancels a Draft", async () => {
    const id = await newDraft()
    expect(await changeEventStatus(t.db, id, "Cancelled")).toEqual({
      success: false,
      error: "status-change-not-allowed"
    })
    expectSuccess(await changeEventStatus(t.db, id, "Published"))
    expect(await changeEventStatus(t.db, id, "Draft")).toEqual({ success: false, error: "status-change-not-allowed" })
    expect(await changeEventStatus(t.db, id, "Published")).toEqual({
      success: false,
      error: "status-change-not-allowed"
    })
    expect(await statusOf(id)).toBe("Published")
  })

  test("refuses an Event that does not exist", async () => {
    expect(await changeEventStatus(t.db, crypto.randomUUID(), "Published")).toEqual({
      success: false,
      error: "event-not-found"
    })
    expect(await deleteEvent(t.db, crypto.randomUUID())).toEqual({ success: false, error: "event-not-found" })
    expect(await getEventDeletionImpact(t.db, crypto.randomUUID())).toBeNull()
  })

  test("counts what a delete removes, then deletes it all, in any status", async () => {
    // Nothing in this module records Responses, Registrations or Attendance, so they are written directly.
    const responded = await newDraft({ participationMode: "ResponseRequired" })
    const registered = await newDraft({ type: "Social" })
    for (const id of [responded, registered]) expectSuccess(await changeEventStatus(t.db, id, "Published"))
    const [lucas, maja] = [await t.user("Lucas"), await t.user("Maja")]
    await t.db.insert(eventResponse).values([
      { eventId: responded, userId: lucas, answer: "Yes" },
      { eventId: responded, userId: maja, answer: "Maybe" }
    ])
    await t.db.insert(eventAttendance).values({ eventId: responded, userId: lucas, status: "Present" })
    await t.db.insert(eventRegistration).values({ eventId: registered, userId: maja })
    expectSuccess(await changeEventStatus(t.db, responded, "Cancelled"))

    expect(await getEventDeletionImpact(t.db, responded)).toEqual({ responses: 2, registrations: 0, attendance: 1 })
    expect(await getEventDeletionImpact(t.db, registered)).toEqual({ responses: 0, registrations: 1, attendance: 0 })

    expectSuccess(await deleteEvent(t.db, responded))
    expect(await statusOf(responded)).toBeUndefined()
    expect(await t.db.select().from(eventResponse).where(eq(eventResponse.eventId, responded))).toEqual([])
    expect(await t.db.select().from(eventAttendance).where(eq(eventAttendance.eventId, responded))).toEqual([])

    const draft = await newDraft()
    expect(await getEventDeletionImpact(t.db, draft)).toEqual({ responses: 0, registrations: 0, attendance: 0 })
    expectSuccess(await deleteEvent(t.db, draft))
  })
})
