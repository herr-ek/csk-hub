#!/usr/bin/env bun
import { and, asc, eq, isNull, or, type SQL, sql } from "drizzle-orm"
import type { PgInsertValue } from "drizzle-orm/pg-core"
import type { db as applicationDb } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import {
  event,
  eventDetail,
  eventSeries,
  eventTarget,
  gig,
  location,
  rehearsal,
  socialEvent
} from "@/core/db/schema/events"
import { group } from "@/core/db/schema/org-structure"
import { assertLocalDatabase } from "./ops/guards"

/**
 * Local example Events from the Events scheme, on top of the example groups (`bun run ops
 * seed-groups`): a weekly KK rehearsal series, a sectional rehearsal, the Alumnikväll gig with
 * Event details, the Höstsittning, a Körmöte for everyone, a room Booking, a Draft and a
 * Cancelled Event. They are dated from the coming week, so there is always something upcoming.
 *
 * It writes the tables directly, so scripts never depend on a feature, and keeps the Events rules
 * by hand: every Rehearsal, Gig and Social has its extension row, the Participation mode is the
 * type's default, and the database turns Stockholm wall-clock times into instants.
 */

type Database = typeof applicationDb | Parameters<Parameters<typeof applicationDb.transaction>[0]>[0]
// Column values may be SQL, so the database can read Stockholm wall-clock times.
type EventValues = PgInsertValue<typeof event> & { title: string }

const TIME_ZONE = "Europe/Stockholm"
const SERIES_WEEKS = 4

/** A Stockholm wall-clock time on the day `days` after `from`, as the database's instant. */
function at(from: string, days: number, time: string): SQL<Date> {
  return sql<Date>`(${`${addDays(from, days)} ${time}`}::timestamp AT TIME ZONE ${TIME_ZONE})`
}

/** Today in Stockholm, `YYYY-MM-DD`. */
function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(new Date())
}

/** The next Monday after `date`, so every run lays its week out the same way. */
function nextMonday(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, weekday === 1 ? 7 : (8 - weekday) % 7)
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * Safe to run again: an example whose title already exists is left as it is, as is the series once
 * it exists. One transaction, so a refused run, such as one before the example groups exist,
 * leaves nothing behind.
 */
export function seedEvents(database: Database, from = today()) {
  return database.transaction(async (tx) => seed(tx, nextMonday(from)))
}

async function seed(database: Database, monday: string) {
  // One at a time: a transaction is one connection.
  const kk = await requireGroup(database, "KK", "Choir")
  const kkb = await requireGroup(database, "KKB", "Section")
  const gigmasteri = await requireGroup(database, "Gigmästeri", "Gigmästeri")
  const sexmasteri = await requireGroup(database, "Sexmästeri", "Sexmästeri")
  const board = await requireGroup(database, null, "Board")
  const gigGroup = await findOrCreateGroup(database, "Alumnikväll", "GigGroup")
  const repsalen = await findOrCreateLocation(database, "Repsalen", "Chalmers tvärgata 3, Göteborg")
  const karhuset = await findOrCreateLocation(database, "Kårhuset", "Chalmersplatsen 1, Göteborg")
  const [leader, responsible] = await activeUsers(database)
  const created: string[] = []

  const add = async (
    values: EventValues,
    parts: {
      targets?: { groupId?: string; voiceFamily?: "S" | "A" | "T" | "B" }[]
      details?: [string, string][]
      extension?: (eventId: string) => Promise<unknown>
    } = {}
  ) => {
    const [row] = await database.insert(event).values(values).returning({ id: event.id })
    if (!row) throw new Error(`No Event created for ${values.title}.`)
    await parts.extension?.(row.id)
    if (parts.targets?.length) {
      await database.insert(eventTarget).values(
        parts.targets.map((target) => ({
          eventId: row.id,
          groupId: target.groupId ?? null,
          voiceFamily: target.voiceFamily ?? null
        }))
      )
    }
    if (parts.details?.length) {
      await database
        .insert(eventDetail)
        .values(parts.details.map(([label, value], sortOrder) => ({ eventId: row.id, label, value, sortOrder })))
    }
    created.push(values.title)
    return row.id
  }
  const missing = async (title: string) => !(await eventTitled(database, title))

  const seriesName = `KK rehearsals, ${term(monday)}`
  const [series] = await database.select().from(eventSeries).where(eq(eventSeries.name, seriesName))
  if (!series) {
    const [newSeries] = await database.insert(eventSeries).values({ name: seriesName }).returning()
    if (!newSeries) throw new Error("No series created.")
    for (let week = 0; week < SERIES_WEEKS; week++) {
      await add(
        {
          type: "Rehearsal",
          status: "Published",
          title: "KK rehearsal",
          startsAt: at(monday, 2 + 7 * week, "18:00"),
          endsAt: at(monday, 2 + 7 * week, "21:00"),
          participationMode: "ResponseRequiredStrict",
          locationId: repsalen,
          organiserGroupId: kk,
          seriesId: newSeries.id
        },
        {
          targets: [{ groupId: kk }],
          extension: (eventId) => database.insert(rehearsal).values({ eventId })
        }
      )
    }
  }

  if (await missing("KKB stämrep")) {
    await add(
      {
        type: "Rehearsal",
        status: "Published",
        title: "KKB stämrep",
        startsAt: at(monday, 7, "18:00"),
        endsAt: at(monday, 7, "20:00"),
        participationMode: "ResponseRequiredStrict",
        locationId: repsalen,
        locationText: "Room 3",
        organiserGroupId: kkb
      },
      {
        targets: [{ groupId: kkb }],
        extension: (eventId) => database.insert(rehearsal).values({ eventId, leaderUserId: leader ?? null })
      }
    )
  }

  if (await missing("Alumnikväll")) {
    await add(
      {
        type: "Gig",
        status: "Published",
        title: "Alumnikväll",
        startsAt: at(monday, 26, "17:00"),
        endsAt: at(monday, 26, "19:00"),
        callTime: at(monday, 26, "15:30"),
        respondBy: at(monday, 19, "23:59"),
        participationMode: "ResponseRequired",
        locationId: karhuset,
        organiserGroupId: gigmasteri
      },
      {
        targets: [{ groupId: gigGroup }],
        details: [
          ["Dress code", "Kavaj"],
          ["Bring", "Music folder and water"]
        ],
        extension: (eventId) =>
          database.insert(gig).values({
            eventId,
            responsibleUserId: responsible ?? leader ?? null,
            contactName: "Eva Berg",
            contactDetails: "eva.berg@example.com, 070-123 45 67"
          })
      }
    )
  }

  if (await missing("Höstsittning")) {
    await add(
      {
        type: "Social",
        status: "Published",
        title: "Höstsittning",
        startsAt: at(monday, 32, "18:00"),
        endsAt: at(monday, 33, "01:00"),
        respondBy: at(monday, 21, "23:59"),
        participationMode: "Registration",
        locationId: karhuset,
        organiserGroupId: sexmasteri
      },
      {
        details: [["Dress code", "Mörk kostym"]],
        extension: (eventId) =>
          database.insert(socialEvent).values({ eventId, costInfo: "200 kr incl. food, 150 kr for new members" })
      }
    )
  }

  if (await missing("Körmöte")) {
    // No Targets: for everyone in CSK.
    await add({
      type: "Körmöte",
      status: "Published",
      title: "Körmöte",
      startsAt: at(monday, 15, "18:30"),
      endsAt: at(monday, 15, "20:00"),
      participationMode: "ResponseRequired",
      locationId: repsalen
    })
  }

  if (await missing("Board room booking")) {
    await add({
      type: "Booking",
      status: "Published",
      title: "Board room booking",
      startsAt: at(monday, 3, "10:00"),
      endsAt: at(monday, 3, "12:00"),
      participationMode: "None",
      locationId: repsalen,
      organiserGroupId: board
    })
  }

  if (await missing("Julkonsert")) {
    await add(
      {
        type: "Concert",
        status: "Draft",
        title: "Julkonsert",
        startsAt: at(monday, 54, "19:00"),
        endsAt: at(monday, 54, "21:00"),
        callTime: at(monday, 54, "17:30"),
        participationMode: "ResponseRequiredStrict",
        organiserGroupId: kk
      },
      { targets: [{ groupId: kk }] }
    )
  }

  if (await missing("KK extra rehearsal")) {
    await add(
      {
        type: "Rehearsal",
        status: "Cancelled",
        title: "KK extra rehearsal",
        startsAt: at(monday, 12, "10:00"),
        endsAt: at(monday, 12, "16:00"),
        participationMode: "ResponseRequiredStrict",
        locationId: repsalen,
        organiserGroupId: kk
      },
      {
        targets: [{ groupId: kk }],
        extension: (eventId) => database.insert(rehearsal).values({ eventId })
      }
    )
  }

  return { created }
}

/** "autumn 2026" from August, "spring 2027" before it. */
function term(date: string) {
  const [year, month] = date.split("-").map(Number) as [number, number]
  return month >= 8 ? `autumn ${year}` : `spring ${year}`
}

async function requireGroup(database: Database, name: string | null, type: (typeof group.type.enumValues)[number]) {
  const [row] = await database
    .select({ id: group.id })
    .from(group)
    .where(and(eq(group.type, type), eq(group.active, true), name ? eq(group.name, name) : undefined))
    .orderBy(asc(group.name))
    .limit(1)
  if (!row) {
    throw new Error(
      `No active ${name ?? type} group; run \`bun run ops reference-data\` and \`bun run ops seed-groups\` first.`
    )
  }
  return row.id
}

async function findOrCreateGroup(database: Database, name: string, type: (typeof group.type.enumValues)[number]) {
  const [found] = await database
    .select({ id: group.id })
    .from(group)
    .where(and(eq(group.name, name), eq(group.active, true), isNull(group.choirId)))
  if (found) return found.id
  const [created] = await database.insert(group).values({ name, type }).returning({ id: group.id })
  if (!created) throw new Error(`No group created for ${name}.`)
  return created.id
}

async function findOrCreateLocation(database: Database, name: string, address: string) {
  const [found] = await database
    .select({ id: location.id })
    .from(location)
    .where(and(eq(location.name, name), eq(location.active, true)))
  if (found) return found.id
  const [created] = await database.insert(location).values({ name, address }).returning({ id: location.id })
  if (!created) throw new Error(`No Location created for ${name}.`)
  return created.id
}

async function activeUsers(database: Database) {
  const rows = await database
    .select({ id: user.id })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)))
    .orderBy(user.createdAt)
    .limit(2)
  return rows.map(({ id }) => id)
}

async function eventTitled(database: Database, title: string) {
  const [row] = await database.select({ id: event.id }).from(event).where(eq(event.title, title)).limit(1)
  return row?.id
}

if (import.meta.main) {
  assertLocalDatabase("Seeding events")
  const { db } = await import("@/core/db")

  const { created } = await seedEvents(db)
  await db.$client.end()

  console.log(created.length > 0 ? `Created Events: ${created.join(", ")}` : "Example Events already exist.")
}
