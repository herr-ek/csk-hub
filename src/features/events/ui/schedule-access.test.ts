import { afterAll, describe, expect, mock, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { AUTHORIZATION_DENIED, AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import { event } from "@/core/db/schema/events"
import { createEvent } from "../events"
import { createLocation } from "../locations"
import { addDays, stockholmDate } from "../model"
import { createRehearsalSeries } from "../rehearsal-series"
import { createEventsTestDatabase, expectSuccess, uniqueName } from "../test-support"

mock.module("@/core/i18n/server", () => ({ getTranslations: async () => (key: string) => key }))

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

const { getRehearsalSchedule } = await import("./schedule/query")
const {
  previewRehearsalSeriesAction,
  createRehearsalSeriesAction,
  setRehearsalLocationAction,
  deleteRehearsalAction,
  publishRehearsalDraftsAction
} = await import("./schedule/actions")
const { getEventEditor } = await import("./editor/query")
const { changeEventStatusAction, updateEventAction } = await import("./editor/actions")

const idle = { status: "idle" } as const
const denied = { status: "error", error: "access-denied" } as const
const success = { status: "success" }
const today = stockholmDate(new Date())
// A whole week ahead, so every weekday has a date in range.
const firstDay = addDays(today, 7)
const lastDay = addDays(today, 27)

function form(values: Record<string, string | string[]>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values))
    for (const one of Array.isArray(value) ? value : [value]) data.append(key, one)
  return data
}

describe.skipIf(!database)("Rehearsal schedule at protected entrypoints", () => {
  const t = database as NonNullable<typeof database>
  afterAll(t.drop)

  async function seriesRows(choirGroupId: string) {
    viewer = await boardMember()
    const schedule = await getRehearsalSchedule({ when: "upcoming", choirGroupId }, new Date())
    return schedule.rehearsals
  }

  // There is one Board group a year, and one Chair in it, so the suite shares its Board member.
  let chair: string | undefined
  async function boardMember() {
    if (!chair) {
      chair = await t.user("Board member")
      await t.representative(chair, await t.group("board"))
    }
    return chair
  }

  test("only Admins and current Board Position holders reach the tool", async () => {
    const choir = await t.choir()
    viewer = null
    await expect(getRehearsalSchedule({ when: "upcoming" }, new Date())).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await expect(
      previewRehearsalSeriesAction({ choirGroupId: choir, weekday: 2, firstDay, lastDay })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)

    for (const type of ["gig-group", "choir"] as const) {
      const holder = await t.user()
      await t.representative(holder, type === "choir" ? choir : await t.group(type))
      viewer = holder
      await expect(getRehearsalSchedule({ when: "upcoming" }, new Date())).rejects.toBeInstanceOf(
        AuthorizationDeniedError
      )
      const preview = await previewRehearsalSeriesAction({ choirGroupId: choir, weekday: 2, firstDay, lastDay })
      expect(preview.state).toEqual(denied)
    }
  })

  test("the Board previews, generates, edits, publishes, cancels and deletes a Choir's Series Rehearsals", async () => {
    const choir = await t.choir()
    const otherChoir = await t.choir()
    viewer = await boardMember()

    // An existing Rehearsal for the Choir flags its date in the preview.
    const preview = await previewRehearsalSeriesAction({ choirGroupId: choir, weekday: 2, firstDay, lastDay })
    const dates = preview.dates?.map(({ date }) => date) ?? []
    expect(dates.length).toBe(3)
    const busy = dates[1] as string
    expectSuccess(
      await createEvent(t.db, {
        type: "Rehearsal",
        title: "Extra",
        schedule: {
          allDay: false,
          startsAt: new Date(`${busy}T10:00:00Z`),
          endsAt: new Date(`${busy}T12:00:00Z`)
        },
        targets: [{ groupId: choir, voiceFamily: null }],
        createdBy: null
      })
    )
    const again = await previewRehearsalSeriesAction({ choirGroupId: choir, weekday: 2, firstDay, lastDay })
    expect(again.dates?.map(({ taken }) => taken)).toEqual([false, true, false])

    const created = await createRehearsalSeriesAction({
      name: uniqueName("KK rehearsals"),
      choirGroupId: choir,
      title: "Rehearsal",
      dates: dates.filter((date) => date !== busy),
      startTime: "18:30",
      endTime: "21:00",
      locationId: null
    })
    expect(created).toMatchObject(success)
    expectSuccess(
      await createRehearsalSeries(t.db, {
        name: uniqueName("Other choir"),
        choirGroupId: otherChoir,
        title: "Rehearsal",
        dates: [firstDay],
        startTime: "18:00",
        endTime: "20:00",
        createdBy: null
      })
    )

    // The filter keeps to the Choir, and the Extra rehearsal outside a Series is not listed.
    const rows = await seriesRows(choir)
    expect(rows.map(({ status, choirGroupId }) => [status, choirGroupId])).toEqual([
      ["Draft", choir],
      ["Draft", choir]
    ])
    const [first, second] = rows as [(typeof rows)[number], (typeof rows)[number]]

    const hall = expectSuccess(await createLocation(t.db, { name: uniqueName("Repsalen") }))
    expect(await setRehearsalLocationAction({ eventId: first.id, locationId: hall.id })).toMatchObject(success)
    const editor = await getEventEditor(first.id)
    expect(editor?.values.locationId).toBe(hall.id)
    expect(editor?.options.organiserGroups.map(({ id }) => id)).toContain(choir)

    // The full editor saves while the Event stays the Choir's Series Rehearsal, and refuses otherwise.
    const values = {
      type: "Rehearsal",
      title: "Rehearsal with guest",
      allDay: "false",
      startsAt: editor?.values.startsAt ?? "",
      endsAt: editor?.values.endsAt ?? "",
      participationMode: "ResponseRequiredStrict",
      organiserGroupId: choir,
      "target.0.groupId": choir
    }
    expect(await updateEventAction(first.id, idle, form(values))).toMatchObject(success)
    expect(await updateEventAction(first.id, idle, form({ ...values, "target.0.voiceFamily": "B" }))).toEqual(denied)
    expect(await updateEventAction(first.id, idle, form({ ...values, type: "Gig" }))).toEqual(denied)
    expect(await updateEventAction(first.id, idle, form({ ...values, organiserGroupId: "" }))).toEqual(denied)

    expect(await publishRehearsalDraftsAction(idle, form({ eventId: [first.id, second.id] }))).toMatchObject(success)
    expect((await seriesRows(choir)).map(({ status }) => status)).toEqual(["Published", "Published"])

    expect(await changeEventStatusAction(idle, form({ eventId: first.id, status: "Cancelled" }))).toMatchObject(
      success
    )
    expect(await deleteRehearsalAction(idle, form({ eventId: second.id }))).toMatchObject(success)
    const left = await t.db.select().from(event).where(eq(event.id, first.id)).orderBy(asc(event.startsAt))
    expect(left.map(({ status }) => status)).toEqual(["Cancelled"])
    expect(await t.db.select().from(event).where(eq(event.id, second.id))).toHaveLength(0)
  })

  test("the Board's reach ends at Choirs' Series Rehearsals", async () => {
    const choir = await t.choir()
    const section = await t.group("section", choir)
    const { seriesId } = expectSuccess(
      await createRehearsalSeries(t.db, {
        name: uniqueName("Series"),
        choirGroupId: choir,
        title: "Rehearsal",
        dates: [firstDay],
        startTime: "18:00",
        endTime: "20:00",
        createdBy: null
      })
    )
    const sectional = expectSuccess(
      await createEvent(t.db, {
        type: "Rehearsal",
        title: "Sectional",
        schedule: {
          allDay: false,
          startsAt: new Date(`${firstDay}T08:00:00Z`),
          endsAt: new Date(`${firstDay}T09:00:00Z`)
        },
        organiserGroupId: choir,
        targets: [{ groupId: section, voiceFamily: null }],
        seriesId,
        createdBy: null
      })
    )
    viewer = await boardMember()
    const listed = (await getRehearsalSchedule({ when: "upcoming", choirGroupId: choir }, new Date())).rehearsals
    expect(listed.map(({ title }) => title)).toEqual(["Rehearsal"])
    expect(await getEventEditor(sectional.id)).toBeNull()
    expect(await setRehearsalLocationAction({ eventId: sectional.id, locationId: null })).toEqual(denied)
    expect(await publishRehearsalDraftsAction(idle, form({ eventId: sectional.id }))).toEqual(denied)
    expect((await t.db.select().from(event).where(eq(event.id, sectional.id)))[0]?.status).toBe("Draft")
  })
})
