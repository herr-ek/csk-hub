import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { AUTHORIZATION_DENIED, AuthorizationDeniedError } from "@/core/authz/authorization"
import { user } from "@/core/db/schema/auth"
import { absenceReason, event, eventDetail, eventResponse, eventTarget, location } from "@/core/db/schema/events"
import { directMembership } from "@/core/db/schema/org-structure"
import { createEventsTestDatabase, uniqueName } from "../test-support"

// The admin Server Actions against a real, throwaway database: only the authorization guard, cache
// revalidation and redirects are replaced, so typed failures travel the whole way from the module.

const database = await createEventsTestDatabase()

const ADMIN = { state: "authenticated" as const, userId: "admin-1" }
const requirePermission = mock(async (_request: { action: string }) => ADMIN)
const revalidatePath = mock(() => undefined)
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`Redirected to ${to}`)
  }
}
const redirect = mock((to: string) => {
  throw new Redirect(to)
})

// A module mock holds for the whole test run, so each keeps the module's other exports for the
// test files that import it later.
const [permissions, cache, navigation] = await Promise.all([
  import("@/core/authz"),
  import("next/cache"),
  import("next/navigation")
])
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/authz", () => ({
  ...permissions,
  requirePermission,
  AUTHORIZATION_DENIED,
  AuthorizationDeniedError,
  forCurrentRequest: async () => ({
    actor: { userId: ADMIN.userId, isAdmin: true },
    requirePermission: () => ({ userId: ADMIN.userId, isAdmin: true }),
    can: () => true
  })
}))
mock.module("next/cache", () => ({ ...cache, revalidatePath }))
mock.module("next/navigation", () => ({ ...navigation, redirect }))

const { createEventAction, updateEventAction, changeEventStatusAction, deleteEventAction } = await import(
  "./editor/actions"
)
const { createLocationAction, updateLocationAction, archiveLocationAction } = await import("./locations/actions")
const { createAbsenceReasonAction, renameAbsenceReasonAction, archiveAbsenceReasonAction } = await import(
  "./absence-reasons/actions"
)
const { respondToEventAction } = await import("../calendar/actions")

const IDLE = { status: "idle" } as const

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.append(key, value)
  return data
}

/** A timed Event's form, as the browser submits it. */
function eventForm(values: Record<string, string> = {}) {
  return form({
    type: "Meeting",
    title: "Styrelsemöte",
    allDay: "false",
    startsAt: "2026-11-03T18:00",
    endsAt: "2026-11-03T20:00",
    participationMode: "None",
    ...values
  })
}

async function redirectOf(action: Promise<unknown>) {
  const error = await action.then(
    () => undefined,
    (thrown: unknown) => thrown
  )
  if (!(error instanceof Redirect)) throw new Error(`Expected a redirect, got ${String(error)}.`)
  return error.to
}

describe.skipIf(!database)("admin Events Server Actions", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  // The acting Admin becomes the Event's creator, so they must exist.
  beforeAll(async () => {
    await t.db.insert(user).values({ id: ADMIN.userId, name: "Admin", email: "admin@example.com" })
  })

  beforeEach(() => {
    requirePermission.mockClear()
    requirePermission.mockImplementation(async () => ADMIN)
    revalidatePath.mockClear()
    redirect.mockClear()
  })

  async function createdEvent(values: Record<string, string> = {}) {
    const to = await redirectOf(createEventAction(IDLE, eventForm(values)))
    return to.split("/").at(-1) as string
  }

  describe("the request guard", () => {
    test("refuses a caller without the required capability before validating or writing anything", async () => {
      const denied = new Error("denied")
      requirePermission.mockImplementation(async () => {
        throw denied
      })
      const title = uniqueName("Smygrep")

      await expect(createEventAction(IDLE, eventForm({ title }))).rejects.toBe(denied)
      await expect(createLocationAction(IDLE, form({ name: title }))).rejects.toBe(denied)
      await expect(createAbsenceReasonAction(IDLE, form({ label: title }))).rejects.toBe(denied)

      expect(await t.db.select().from(event).where(eq(event.title, title))).toEqual([])
      expect(await t.db.select().from(location).where(eq(location.name, title))).toEqual([])
      expect(await t.db.select().from(absenceReason).where(eq(absenceReason.label, title))).toEqual([])
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    test("requires event.administer for Absence reasons, and only active identity to respond", async () => {
      await createAbsenceReasonAction(IDLE, form({ label: uniqueName("Sick") }))
      await respondToEventAction(IDLE, form({}))
      expect(requirePermission.mock.calls.map(([request]) => request.action)).toEqual([
        "event.administer",
        "app.access"
      ])
    })

    test("guards every action", async () => {
      const actions = [
        createEventAction,
        (state: typeof IDLE, data: FormData) => updateEventAction(crypto.randomUUID(), state, data),
        changeEventStatusAction,
        deleteEventAction,
        createLocationAction,
        updateLocationAction,
        archiveLocationAction,
        createAbsenceReasonAction,
        renameAbsenceReasonAction,
        archiveAbsenceReasonAction,
        respondToEventAction
      ]
      for (const action of actions) await action(IDLE, form({}))
      expect(requirePermission).toHaveBeenCalledTimes(actions.length)
      for (const [request] of requirePermission.mock.calls) {
        expect(["app.access", "event.administer"]).toContain(request.action)
      }
    })
  })

  describe("Events", () => {
    test("creates a Draft for the acting Admin and opens its page", async () => {
      const id = await createdEvent({
        type: "Gig",
        participationMode: "ResponseRequired",
        "detail.r0.label": "Dress code",
        "detail.r0.value": "Kavaj",
        "detail.r1.label": "Bring",
        "detail.r1.value": "Music folder"
      })
      const [row] = await t.db.select().from(event).where(eq(event.id, id))
      expect(row).toMatchObject({ type: "Gig", status: "Draft", createdBy: ADMIN.userId })
      // The form's wall-clock times are Stockholm's.
      expect(row?.startsAt.toISOString()).toBe("2026-11-03T17:00:00.000Z")
      const details = await t.db
        .select({ label: eventDetail.label })
        .from(eventDetail)
        .where(eq(eventDetail.eventId, id))
        .orderBy(asc(eventDetail.sortOrder))
      expect(details.map(({ label }) => label)).toEqual(["Dress code", "Bring"])
      expect(revalidatePath).toHaveBeenCalledWith("/admin/events", "layout")
      expect(redirect).toHaveBeenCalledWith(`/events/manage/${id}`)
    })

    test("passes a module violation through as a typed failure", async () => {
      expect(await createEventAction(IDLE, eventForm({ endsAt: "2026-11-03T17:00" }))).toEqual({
        status: "error",
        error: "ends-before-start"
      })
      expect(await createEventAction(IDLE, eventForm({ title: " " }))).toEqual({
        status: "error",
        error: "title-required"
      })
      expect(
        await createEventAction(IDLE, eventForm({ participationMode: "None", respondBy: "2026-11-01T12:00" }))
      ).toEqual({ status: "error", error: "respond-by-without-participation" })
      expect(redirect).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    test("refuses malformed input as invalid input", async () => {
      expect(await createEventAction(IDLE, eventForm({ type: "Picnic" }))).toEqual({
        status: "error",
        error: "invalid-input"
      })
      expect(await updateEventAction("not-a-uuid", IDLE, eventForm())).toEqual({
        status: "error",
        error: "invalid-input"
      })
    })

    test("saves an edit, and moves the Event through its lifecycle", async () => {
      const id = await createdEvent()
      expect(
        await updateEventAction(id, IDLE, eventForm({ type: "Rehearsal", participationMode: "ResponseRequiredStrict" }))
      ).toMatchObject({ status: "success" })

      const change = (status: string) => changeEventStatusAction(IDLE, form({ eventId: id, status }))
      expect(await change("Published")).toMatchObject({ status: "success" })
      expect(await change("Draft")).toEqual({ status: "error", error: "status-change-not-allowed" })
      expect(await change("Cancelled")).toMatchObject({ status: "success" })
      const [row] = await t.db.select({ status: event.status, type: event.type }).from(event).where(eq(event.id, id))
      expect(row).toEqual({ status: "Cancelled", type: "Rehearsal" })

      expect(await redirectOf(deleteEventAction(IDLE, form({ eventId: id })))).toBe("/events/manage")
      expect(await deleteEventAction(IDLE, form({ eventId: id }))).toEqual({
        status: "error",
        error: "event-not-found"
      })
    })
  })

  describe("Locations", () => {
    test("creates, edits and archives a Location, passing violations through", async () => {
      const name = uniqueName("Kårhuset")
      expect(await createLocationAction(IDLE, form({ name, mapUrl: "" }))).toMatchObject({ status: "success" })
      expect(await createLocationAction(IDLE, form({ name }))).toEqual({
        status: "error",
        error: "location-name-taken"
      })
      expect(await createLocationAction(IDLE, form({ name: uniqueName("Hall"), mapUrl: "ftp://x" }))).toEqual({
        status: "error",
        error: "invalid-map-url"
      })

      const [row] = await t.db.select().from(location).where(eq(location.name, name))
      const locationId = row?.id as string
      expect(await updateLocationAction(IDLE, form({ locationId, name, address: "Chalmersplatsen 1" }))).toMatchObject({
        status: "success"
      })
      expect(await archiveLocationAction(IDLE, form({ locationId }))).toMatchObject({ status: "success" })
      expect(await archiveLocationAction(IDLE, form({ locationId }))).toEqual({
        status: "error",
        error: "location-archived"
      })
    })
  })

  describe("Absence reasons", () => {
    test("creates, renames and archives a reason, passing violations through", async () => {
      const label = uniqueName("Exam")
      expect(await createAbsenceReasonAction(IDLE, form({ label }))).toMatchObject({ status: "success" })
      expect(await createAbsenceReasonAction(IDLE, form({ label }))).toEqual({
        status: "error",
        error: "absence-reason-label-taken"
      })
      const [row] = await t.db.select().from(absenceReason).where(eq(absenceReason.label, label))
      const reasonId = row?.id as string
      expect(await renameAbsenceReasonAction(IDLE, form({ reasonId, label: " " }))).toEqual({
        status: "error",
        error: "absence-reason-label-required"
      })
      expect(await archiveAbsenceReasonAction(IDLE, form({ reasonId }))).toMatchObject({ status: "success" })
      expect(await archiveAbsenceReasonAction(IDLE, form({ reasonId }))).toEqual({
        status: "error",
        error: "absence-reason-archived"
      })
    })
  })

  describe("Responses", () => {
    async function choirEvent(participationMode: "ResponseRequired" | "ResponseRequiredStrict") {
      const choirId = await t.choir()
      const [row] = await t.db
        .insert(event)
        .values({
          type: "Concert",
          status: "Published",
          title: uniqueName("Concert"),
          // The action answers at the real time, so the Event lies well ahead of it.
          startsAt: new Date("2030-01-10T17:00:00Z"),
          endsAt: new Date("2030-01-10T19:00:00Z"),
          participationMode
        })
        .returning({ id: event.id })
      const eventId = row?.id as string
      await t.db.insert(eventTarget).values({ eventId, groupId: choirId })
      return { eventId, choirId }
    }

    async function signedIn(name: string, choirId?: string) {
      const userId = await t.user(name)
      if (choirId) await t.db.insert(directMembership).values({ userId, groupId: choirId, startDate: "2020-01-01" })
      requirePermission.mockImplementation(async () => ({ state: "authenticated" as const, userId }))
      return userId
    }

    test("records the signed-in User's answer, and refuses anyone outside the Audience", async () => {
      const { eventId, choirId } = await choirEvent("ResponseRequired")

      await signedIn("Outsider")
      expect(await respondToEventAction(IDLE, form({ eventId, answer: "Yes" }))).toEqual({
        status: "error",
        error: "not-in-audience"
      })
      expect(await t.db.select().from(eventResponse).where(eq(eventResponse.eventId, eventId))).toEqual([])

      const singer = await signedIn("Singer", choirId)
      expect(
        await respondToEventAction(IDLE, form({ eventId, answer: "No", reason: "other", reasonText: "Exam" }))
      ).toMatchObject({ status: "success" })
      expect(await t.db.select().from(eventResponse).where(eq(eventResponse.eventId, eventId))).toMatchObject([
        { userId: singer, answer: "No", reasonText: "Exam", absenceReasonId: null }
      ])
    })

    test("passes the module's typed failures through, and refuses malformed input", async () => {
      const { eventId, choirId } = await choirEvent("ResponseRequiredStrict")
      await signedIn("Singer", choirId)

      expect(await respondToEventAction(IDLE, form({ eventId, answer: "Maybe" }))).toEqual({
        status: "error",
        error: "maybe-not-allowed"
      })
      expect(await respondToEventAction(IDLE, form({ eventId, answer: "No" }))).toEqual({
        status: "error",
        error: "absence-reason-required"
      })
      expect(await respondToEventAction(IDLE, form({ eventId, answer: "Perhaps" }))).toEqual({
        status: "error",
        error: "invalid-input"
      })
    })
  })
})
