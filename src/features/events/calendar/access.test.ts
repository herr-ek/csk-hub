import { afterAll, describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import { user } from "@/core/db/schema/auth"
import { endMembership, startMembership } from "@/features/org-structure"
import { createEvent } from "../events"
import { changeEventStatus } from "../lifecycle"
import { createEventsTestDatabase, eventInput, expectSuccess } from "../test-support"

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
const { getCurrentEventPage, listCurrentUpcomingEvents } = await import("./query")

describe.skipIf(!database)("protected Event calendar", () => {
  const t = database as NonNullable<typeof database>
  afterAll(t.drop)

  test("fresh calendar reads agree on immediate future departure and retained viewing from Event start", async () => {
    viewer = await t.user()
    const groupId = await t.group("GigGroup")
    expect((await startMembership(t.db, { userId: viewer, groupId, startDate: "2020-01-01" })).success).toBe(true)
    const stored = expectSuccess(
      await createEvent(t.db, {
        ...eventInput({
          targets: [{ groupId, voiceFamily: null }],
          schedule: {
            allDay: false,
            startsAt: new Date("2026-10-01T16:00Z"),
            endsAt: new Date("2026-10-03T16:00Z")
          }
        }),
        createdBy: null
      })
    )
    expectSuccess(await changeEventStatus(t.db, stored.id, "Published"))
    const before = new Date("2026-09-30")
    expect(await getCurrentEventPage(stored.id, before)).toMatchObject({ id: stored.id })
    expect((await listCurrentUpcomingEvents(before)).events.map(({ id }) => id)).toContain(stored.id)
    expect((await endMembership(t.db, { userId: viewer, groupId, endDate: "2026-10-02" })).success).toBe(true)
    expect(await getCurrentEventPage(stored.id, before)).toBeNull()
    expect((await listCurrentUpcomingEvents(before)).events).toEqual([])
    expect(await getCurrentEventPage(stored.id, new Date("2026-10-01T16:00Z"))).toMatchObject({ id: stored.id })
    expect((await listCurrentUpcomingEvents(new Date("2026-10-02T18:00Z"))).events.map(({ id }) => id)).toContain(
      stored.id
    )
    expect(await getCurrentEventPage(stored.id, new Date("2026-10-04"))).toMatchObject({ id: stored.id })
    await t.db.update(user).set({ banned: true }).where(eq(user.id, viewer))
    await expect(getCurrentEventPage(stored.id, before)).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await expect(listCurrentUpcomingEvents(before)).rejects.toBeInstanceOf(AuthorizationDeniedError)
    viewer = null
    await expect(getCurrentEventPage(stored.id, before)).rejects.toBeInstanceOf(AuthorizationDeniedError)
  })
})
