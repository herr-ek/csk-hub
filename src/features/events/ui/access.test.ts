import { afterAll, describe, expect, mock, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { AUTHORIZATION_DENIED, AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import { user } from "@/core/db/schema/auth"
import { event } from "@/core/db/schema/events"
import { groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { archiveGroup, endMembership, endPositionHolding } from "@/features/org-structure"
import { createEvent } from "../events"
import { createEventsTestDatabase, eventInput, expectSuccess } from "../test-support"

const database = await createEventsTestDatabase()
let viewer: string | null = null
const access = database
  ? createAuthorization({
      database: database.db,
      readSession: async () => (viewer ? { user: { id: viewer } } : null)
    })
  : undefined
mock.module("@/core/authz", () => ({
  AUTHORIZATION_DENIED,
  AuthorizationDeniedError,
  requirePermission: access?.requirePermission,
  forCurrentRequest: access?.forCurrentRequest
}))
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("next/cache", () => ({ revalidatePath: mock() }))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  }
}))

const { withEventPermission } = await import("../access")
const { getEventEditor, getEventFormOptions } = await import("./editor/query")
const { listManagedEvents } = await import("./list/query")
const { listLocations } = await import("./locations/query")
const { createEventAction, updateEventAction, changeEventStatusAction, deleteEventAction } = await import(
  "./editor/actions"
)
const { createLocationAction, updateLocationAction, archiveLocationAction } = await import("./locations/actions")
const idle = { status: "idle" } as const
const denied = { status: "error", error: "access-denied" } as const

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    type: "Meeting",
    title: "Delegated event",
    allDay: "false",
    startsAt: "2027-01-03T18:00",
    endsAt: "2027-01-03T20:00",
    participationMode: "None",
    ...values
  }))
    data.set(key, value)
  return data
}

describe.skipIf(!database)("Event delegation at protected entrypoints", () => {
  const t = database as NonNullable<typeof database>
  afterAll(t.drop)

  test("anonymous reads and every direct action fail without route guards", async () => {
    viewer = null
    await expect(listManagedEvents({ when: "upcoming" }, new Date())).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await expect(getEventFormOptions()).rejects.toBeInstanceOf(AuthorizationDeniedError)
    expect(await getEventEditor(crypto.randomUUID())).toBeNull()
    for (const action of [
      createEventAction,
      (state: typeof idle, data: FormData) => updateEventAction(crypto.randomUUID(), state, data),
      changeEventStatusAction,
      deleteEventAction,
      createLocationAction,
      updateLocationAction,
      archiveLocationAction
    ])
      await expect(action(idle, form())).rejects.toBeInstanceOf(AuthorizationDeniedError)
  })

  test("exact organiser delegation covers reads, creation, edits, lifecycle and deletion; targets and creator confer no authority", async () => {
    const holder = await t.user()
    const stranger = await t.user()
    const organiser = await t.group("Board")
    const otherGroup = await t.group("GigGroup")
    const choir = await t.choir()
    await t.representative(holder, organiser)
    await t.representative(holder, choir)
    const owned = expectSuccess(
      await createEvent(t.db, { ...eventInput({ organiserGroupId: organiser }), createdBy: stranger })
    )
    const foreign = expectSuccess(
      await createEvent(t.db, {
        ...eventInput({ organiserGroupId: otherGroup, targets: [{ groupId: organiser, voiceFamily: null }] }),
        createdBy: holder
      })
    )
    const choirEvent = expectSuccess(
      await createEvent(t.db, { ...eventInput({ organiserGroupId: choir }), createdBy: holder })
    )
    const unowned = expectSuccess(await createEvent(t.db, { ...eventInput(), createdBy: holder }))
    viewer = holder
    const rows = await listManagedEvents({ when: "upcoming" }, new Date("2020-01-01"))
    expect(rows.map(({ id }) => id)).toEqual([owned.id])
    expect(await getEventEditor(owned.id)).toMatchObject({ id: owned.id })
    for (const id of [foreign.id, choirEvent.id, unowned.id]) {
      expect(await getEventEditor(id)).toBeNull()
      expect(await updateEventAction(id, idle, form({ organiserGroupId: organiser }))).toEqual(denied)
      expect(await deleteEventAction(idle, form({ eventId: id }))).toEqual(denied)
      expect(await changeEventStatusAction(idle, form({ eventId: id, status: "Published" }))).toEqual(denied)
    }
    const options = await getEventFormOptions()
    expect(options.organiserGroups.map(({ id }) => id)).toEqual([organiser])
    expect(options.users.length).toBeGreaterThan(0)
    expect(options.users.every((entry) => !("email" in entry))).toBe(true)
    for (const id of ["", otherGroup, choir]) {
      expect(await createEventAction(idle, form({ organiserGroupId: id }))).toEqual(denied)
      expect(await updateEventAction(owned.id, idle, form({ organiserGroupId: id }))).toEqual(denied)
    }
    await expect(createEventAction(idle, form({ organiserGroupId: organiser, createdBy: stranger }))).rejects.toThrow(
      "redirect:/events/"
    )
    const created = await t.db.select().from(event).where(eq(event.title, "Delegated event"))
    expect(created).toHaveLength(1)
    expect(created[0].createdBy).toBe(holder)
    expect(
      await updateEventAction(owned.id, idle, form({ organiserGroupId: organiser, title: "Edited" }))
    ).toMatchObject({ status: "success" })
    for (const status of ["Published", "Cancelled", "Published"]) {
      expect(await changeEventStatusAction(idle, form({ eventId: owned.id, status }))).toMatchObject({
        status: "success"
      })
    }
    await t.representative(holder, otherGroup)
    expect(await updateEventAction(owned.id, idle, form({ organiserGroupId: otherGroup }))).toMatchObject({
      status: "success"
    })
    await expect(deleteEventAction(idle, form({ eventId: owned.id }))).rejects.toThrow("redirect:/events")
    for (const call of [
      () => listLocations(),
      () => createLocationAction(idle, form()),
      () => updateLocationAction(idle, form()),
      () => archiveLocationAction(idle, form())
    ]) {
      await expect(call()).rejects.toBeInstanceOf(AuthorizationDeniedError)
    }
    viewer = stranger
    expect(await listManagedEvents({ when: "upcoming" }, new Date("2020-01-01"))).toEqual([])
  })

  test("Event authorization locks serialize with departure, Position termination, archival and organiser reassignment", async () => {
    const holder = await t.user()
    const organiser = await t.group("GigGroup")
    const positionId = await t.representative(holder, organiser)
    const stored = expectSuccess(
      await createEvent(t.db, { ...eventInput({ organiserGroupId: organiser }), createdBy: holder })
    )
    viewer = holder
    await withEventPermission("event.update", stored.id, undefined, async () => {
      for (const operation of [
        (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) =>
          endPositionHolding(tx, { userId: holder, groupId: organiser, positionId, endDate: "2026-11-16" }),
        (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) =>
          endMembership(tx, { userId: holder, groupId: organiser, endDate: "2026-11-16" }),
        (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => archiveGroup(tx, organiser),
        (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) =>
          tx.update(event).set({ organiserGroupId: null }).where(eq(event.id, stored.id))
      ]) {
        await expect(
          t.db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL lock_timeout = '100ms'`)
            return operation(tx)
          })
        ).rejects.toMatchObject({ cause: { code: "55P03" } })
      }
    })
    expect(
      await endPositionHolding(t.db, { userId: holder, groupId: organiser, positionId, endDate: "2026-11-16" })
    ).toMatchObject({ success: true })
    expect(await getEventEditor(stored.id)).toBeNull()
  })

  test("departure, handover, archival and User deactivation remove delegated authority", async () => {
    const holder = await t.user()
    const organiser = await t.group("GigGroup")
    await t.representative(holder, organiser)
    const stored = expectSuccess(
      await createEvent(t.db, { ...eventInput({ organiserGroupId: organiser }), createdBy: holder })
    )
    viewer = holder
    expect(await getEventEditor(stored.id)).toMatchObject({ id: stored.id })
    await t.db.update(positionHolder).set({ endDate: "2026-11-16" }).where(eq(positionHolder.userId, holder))
    expect(await getEventEditor(stored.id)).toBeNull()
    expect(await updateEventAction(stored.id, idle, form({ organiserGroupId: organiser }))).toEqual(denied)
    await t.db.update(positionHolder).set({ endDate: null }).where(eq(positionHolder.userId, holder))
    await t.db.update(groupMember).set({ endDate: "2026-11-16" }).where(eq(groupMember.userId, holder))
    expect(await getEventEditor(stored.id)).toBeNull()
    await t.db.update(groupMember).set({ endDate: null }).where(eq(groupMember.userId, holder))
    await t.archiveGroup(organiser)
    expect(await getEventEditor(stored.id)).toBeNull()
    const admin = await t.user()
    await t.db.update(user).set({ role: "admin" }).where(eq(user.id, admin))
    viewer = admin
    expect(await getEventEditor(stored.id)).toMatchObject({ id: stored.id })
    expect(await getEventFormOptions()).toMatchObject({
      users: expect.arrayContaining([expect.objectContaining({ email: expect.any(String) })])
    })
    await t.db.update(user).set({ banned: true }).where(eq(user.id, admin))
    await expect(deleteEventAction(idle, form({ eventId: stored.id }))).rejects.toBeInstanceOf(AuthorizationDeniedError)
  })
})
