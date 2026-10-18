import { afterAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Client } from "pg"
import { event, eventDetail, eventTarget, gig, rehearsal, socialEvent } from "@/core/db/schema/events"
import { createTestDatabase } from "../test/database"
import { insertReferenceData } from "./ops/reference-data"
import { seedEvents } from "./seed-events"
import { seedGroups } from "./seed-groups"

const database = await createTestDatabase()

describe.skipIf(!database)("seedEvents", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("refuses to run before the example groups exist", async () => {
    await expect(seedEvents(t.db)).rejects.toThrow("bun run ops seed-groups")
  })

  test("writes the scheme's examples, keeping the Events rules, once", async () => {
    const client = new Client({ connectionString: t.url })
    await client.connect()
    await insertReferenceData(client)
    await client.end()
    await seedGroups(t.db)

    // A Sunday: the examples start from the next Monday, 19 October.
    const { created } = await seedEvents(t.db, "2026-10-18")
    expect(created).toEqual(
      expect.arrayContaining(["KK rehearsal", "KKB stämrep", "Alumnikväll", "Höstsittning", "Körmöte"])
    )

    const events = await t.db.select().from(event)
    const statuses = events.map(({ status }) => status)
    expect(statuses.filter((status) => status === "Draft")).toHaveLength(1)
    expect(statuses.filter((status) => status === "Cancelled")).toHaveLength(1)
    expect(events.filter(({ seriesId }) => seriesId !== null).length).toBeGreaterThan(1)

    // Every Rehearsal, Gig and Social has its extension row, and no other type does.
    const [rehearsals, gigs, socials] = await Promise.all([
      t.db.select().from(rehearsal),
      t.db.select().from(gig),
      t.db.select().from(socialEvent)
    ])
    expect(rehearsals).toHaveLength(events.filter(({ type }) => type === "Rehearsal").length)
    expect(gigs).toHaveLength(events.filter(({ type }) => type === "Gig").length)
    expect(socials).toHaveLength(events.filter(({ type }) => type === "Social").length)

    const [first] = await t.db
      .select({ local: sql<string>`to_char(${event.startsAt} AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI')` })
      .from(event)
      .where(eq(event.title, "KK rehearsal"))
      .orderBy(event.startsAt)
      .limit(1)
    expect(first?.local).toBe("2026-10-21 18:00")

    const [korMote] = events.filter(({ type }) => type === "Körmöte")
    expect(
      await t.db
        .select()
        .from(eventTarget)
        .where(eq(eventTarget.eventId, korMote?.id as string))
    ).toEqual([])
    const [alumnikvall] = events.filter(({ title }) => title === "Alumnikväll")
    const details = await t.db
      .select({ label: eventDetail.label })
      .from(eventDetail)
      .where(eq(eventDetail.eventId, alumnikvall?.id as string))
      .orderBy(eventDetail.sortOrder)
    expect(details.map(({ label }) => label)).toEqual(["Dress code", "Bring"])

    expect(await seedEvents(t.db, "2026-10-18")).toEqual({ created: [] })
  })
})
