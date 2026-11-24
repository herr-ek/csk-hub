import { afterAll, describe, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { event, eventSeries, eventTarget, rehearsal } from "@/core/db/schema/events"
import { GroupType } from "@/core/org-structure"
import { setEventLocation } from "./events"
import { archiveLocation, createLocation } from "./locations"
import { createRehearsalSeries, type RehearsalSeriesInput } from "./rehearsal-series"
import { createEventsTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createEventsTestDatabase()
const today = "2026-11-22"

describe.skipIf(!database)("Rehearsal series", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function input(overrides: Partial<RehearsalSeriesInput> = {}): Promise<RehearsalSeriesInput> {
    return {
      name: "KK rehearsals, autumn 2026",
      choirGroupId: await t.choir(),
      title: "Rehearsal",
      dates: ["2026-12-08", "2026-11-24"],
      startTime: "18:30",
      endTime: "21:00",
      createdBy: null,
      ...overrides
    }
  }

  test("creates a Series of Draft Rehearsals for the whole Choir, in Stockholm time", async () => {
    const values = await input()
    const { seriesId, count } = expectSuccess(await createRehearsalSeries(t.db, values, today))
    expect(count).toBe(2)

    const [series] = await t.db.select().from(eventSeries).where(eq(eventSeries.id, seriesId))
    expect(series?.name).toBe(values.name)
    const rows = await t.db.select().from(event).where(eq(event.seriesId, seriesId)).orderBy(asc(event.startsAt))
    expect(rows.map(({ startsAt, endsAt }) => [startsAt.toISOString(), endsAt.toISOString()])).toEqual([
      ["2026-11-24T17:30:00.000Z", "2026-11-24T20:00:00.000Z"],
      ["2026-12-08T17:30:00.000Z", "2026-12-08T20:00:00.000Z"]
    ])
    for (const row of rows) {
      expect(row).toMatchObject({
        type: "Rehearsal",
        status: "Draft",
        organiserGroupId: values.choirGroupId,
        participationMode: "ResponseRequiredStrict"
      })
      expect(await t.db.select().from(eventTarget).where(eq(eventTarget.eventId, row.id))).toMatchObject([
        { groupId: values.choirGroupId, voiceFamily: null }
      ])
      expect(await t.db.select().from(rehearsal).where(eq(rehearsal.eventId, row.id))).toHaveLength(1)
    }
  })

  test("refuses the whole run, leaving no Series behind", async () => {
    const choirGroupId = await t.choir()
    const refusals: [Partial<RehearsalSeriesInput>, string][] = [
      [{ dates: [] }, "no-dates"],
      [
        { dates: Array.from({ length: 27 }, (_, i) => `2027-0${1 + Math.floor(i / 9)}-${10 + (i % 9)}`) },
        "too-many-dates"
      ],
      [{ dates: ["2026-11-21", "2026-11-24"] }, "date-in-past"],
      [{ endTime: "18:30" }, "ends-before-start"],
      [{ startTime: "25:00" }, "invalid-date"],
      [{ name: "  " }, "series-name-required"],
      [{ title: " " }, "title-required"],
      [{ choirGroupId: await t.group(GroupType.Board) }, "not-a-choir"],
      [{ choirGroupId: crypto.randomUUID() }, "target-group-not-found"]
    ]
    for (const [overrides, error] of refusals) {
      const name = uniqueName("Refused")
      const result = await createRehearsalSeries(t.db, await input({ choirGroupId, name, ...overrides }), today)
      expect(result).toEqual({ success: false, error } as never)
      expect(await t.db.select().from(eventSeries).where(eq(eventSeries.name, name))).toHaveLength(0)
    }

    await t.archiveGroup(choirGroupId)
    expect(await createRehearsalSeries(t.db, await input({ choirGroupId }), today)).toEqual({
      success: false,
      error: "target-group-archived"
    })
  })

  test("sets only the Location, keeping an archived one the Event already has", async () => {
    const { seriesId } = expectSuccess(await createRehearsalSeries(t.db, await input(), today))
    const [row] = await t.db.select().from(event).where(eq(event.seriesId, seriesId)).limit(1)
    if (!row) throw new Error("No Rehearsal created.")
    await t.db.update(event).set({ locationText: "room 3" }).where(eq(event.id, row.id))

    const hall = expectSuccess(await createLocation(t.db, { name: uniqueName("Hall") }))
    const room = expectSuccess(await createLocation(t.db, { name: uniqueName("Room") }))
    expectSuccess(await setEventLocation(t.db, row.id, hall.id))
    expectSuccess(await archiveLocation(t.db, hall.id))
    expectSuccess(await setEventLocation(t.db, row.id, hall.id))
    expectSuccess(await archiveLocation(t.db, room.id))
    expect(await setEventLocation(t.db, row.id, room.id)).toEqual({ success: false, error: "location-archived" })
    expectSuccess(await setEventLocation(t.db, row.id, null))
    expect(await setEventLocation(t.db, crypto.randomUUID(), null)).toEqual({
      success: false,
      error: "event-not-found"
    })

    const [after] = await t.db.select().from(event).where(eq(event.id, row.id))
    expect(after).toMatchObject({ locationId: null, locationText: "room 3" })
  })
})
