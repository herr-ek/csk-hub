import { afterAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Client } from "pg"
import { user } from "@/core/db/schema/auth"
import {
  absenceReason,
  event,
  eventDetail,
  eventResponse,
  eventTarget,
  gig,
  rehearsal,
  socialEvent
} from "@/core/db/schema/events"
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
    // Enough singers for three in each Choir, so KK's example Responses have someone to give them.
    await t.db.insert(user).values(
      Array.from({ length: 9 }, (_, index) => ({
        id: `singer-${index}`,
        name: `Singer ${index}`,
        email: `singer-${index}@example.com`,
        createdAt: new Date(Date.UTC(2026, 0, 1 + index))
      }))
    )
    await seedGroups(t.db)

    // A Sunday: the examples start from the next Monday, 19 October.
    const { created } = await seedEvents(t.db, "2026-10-18")
    expect(created).toEqual(
      expect.arrayContaining([
        ...["KK", "MK", "DK"].flatMap((choir) => [
          `${choir} rehearsal`,
          `${choir} julkonsert`,
          `${choir} extra rehearsal`
        ]),
        ...["KKB", "MKT1", "DKS1"].map((section) => `${section} stämrep`),
        "Alumnikväll",
        "Höstsittning",
        "Januarimöte"
      ])
    )

    const events = await t.db.select().from(event)
    const statuses = events.map(({ status }) => status)
    // Each Choir has its own Draft concert, Cancelled extra rehearsal and weekly rehearsal series.
    expect(statuses.filter((status) => status === "Draft")).toHaveLength(3)
    expect(statuses.filter((status) => status === "Cancelled")).toHaveLength(3)
    const series = events.filter(({ seriesId }) => seriesId !== null)
    expect(new Set(series.map(({ seriesId }) => seriesId)).size).toBe(3)
    expect(series).toHaveLength(12)

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
    expect(first?.local).toBe("2026-10-22 18:30")

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

    expect((await t.db.select().from(absenceReason)).map(({ label }) => label).sort()).toEqual([
      "Exam",
      "Sick",
      "Travelling",
      "Work"
    ])
    const responses = async () =>
      t.db
        .select({
          title: event.title,
          startsAt: event.startsAt,
          answer: eventResponse.answer,
          reason: absenceReason.label,
          reasonText: eventResponse.reasonText
        })
        .from(eventResponse)
        .innerJoin(event, eq(event.id, eventResponse.eventId))
        .leftJoin(absenceReason, eq(absenceReason.id, eventResponse.absenceReasonId))
        .orderBy(event.title, eventResponse.answer, eventResponse.reasonText)
    const given = await responses()
    expect(given.map(({ startsAt: _, ...response }) => response)).toEqual([
      { title: "Alumnikväll", answer: "Maybe", reason: null, reasonText: null },
      { title: "KK rehearsal", answer: "Yes", reason: null, reasonText: null },
      { title: "KK rehearsal", answer: "No", reason: null, reasonText: "Moving apartment" },
      { title: "KK rehearsal", answer: "No", reason: "Exam", reasonText: null }
    ])
    // All to the first of KK's rehearsals.
    const [firstKk] = await t.db
      .select({ startsAt: event.startsAt })
      .from(event)
      .where(eq(event.title, "KK rehearsal"))
      .orderBy(event.startsAt)
      .limit(1)
    for (const { title, startsAt } of given) {
      if (title === "KK rehearsal") expect(startsAt).toEqual(firstKk?.startsAt as Date)
    }

    expect(await seedEvents(t.db, "2026-10-18")).toEqual({ created: [] })
    expect(await responses()).toHaveLength(4)
  })
})
