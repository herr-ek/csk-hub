import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { event, eventDetail, location } from "@/core/db/schema/events"
import { createEventsTestDatabase, uniqueName } from "../test-support"

// The admin Server Actions against a real, throwaway database: only the Admin guard, cache
// revalidation and redirects are replaced, so typed failures travel the whole way from the module.

const database = await createEventsTestDatabase()

const ADMIN = { state: "authenticated" as const, userId: "admin-1" }
const requireAdmin = mock(async () => ADMIN)
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
  import("@/core/auth/permissions.server"),
  import("next/cache"),
  import("next/navigation")
])
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/auth/permissions.server", () => ({ ...permissions, requireAdmin }))
mock.module("next/cache", () => ({ ...cache, revalidatePath }))
mock.module("next/navigation", () => ({ ...navigation, redirect }))

const { createEventAction, updateEventAction, changeEventStatusAction, deleteEventAction } = await import(
  "./editor/actions"
)
const { createLocationAction, updateLocationAction, archiveLocationAction } = await import("./locations/actions")

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
    requireAdmin.mockClear()
    requireAdmin.mockImplementation(async () => ADMIN)
    revalidatePath.mockClear()
    redirect.mockClear()
  })

  async function createdEvent(values: Record<string, string> = {}) {
    const to = await redirectOf(createEventAction(IDLE, eventForm(values)))
    return to.split("/").at(-1) as string
  }

  describe("the Admin guard", () => {
    test("refuses a non-Admin before validating or writing anything", async () => {
      const denied = new Error("denied")
      requireAdmin.mockImplementation(async () => {
        throw denied
      })
      const title = uniqueName("Smygrep")

      await expect(createEventAction(IDLE, eventForm({ title }))).rejects.toBe(denied)
      await expect(createLocationAction(IDLE, form({ name: title }))).rejects.toBe(denied)

      expect(await t.db.select().from(event).where(eq(event.title, title))).toEqual([])
      expect(await t.db.select().from(location).where(eq(location.name, title))).toEqual([])
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    test("guards every action", async () => {
      const actions = [
        createEventAction,
        (state: typeof IDLE, data: FormData) => updateEventAction(crypto.randomUUID(), state, data),
        changeEventStatusAction,
        deleteEventAction,
        createLocationAction,
        updateLocationAction,
        archiveLocationAction
      ]
      for (const action of actions) await action(IDLE, form({}))
      expect(requireAdmin).toHaveBeenCalledTimes(actions.length)
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
      expect(redirect).toHaveBeenCalledWith(`/admin/events/${id}`)
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

      expect(await redirectOf(deleteEventAction(IDLE, form({ eventId: id })))).toBe("/admin/events")
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
})
