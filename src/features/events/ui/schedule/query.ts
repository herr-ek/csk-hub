import "server-only"

import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm"
import { type Database, db } from "@/core/db"
import { event, eventSeries, eventTarget, location } from "@/core/db/schema/events"
import { group } from "@/core/db/schema/org-structure"
import { GroupType } from "@/core/org-structure"
import { listActiveGroups, listLocalizedGroupLabels } from "@/features/org-structure"
import { withRehearsalSchedulePermission } from "../../access"
import { addDays, type IsoDate, stockholmDate, stockholmInstant } from "../../model"

export type ScheduleFilters = {
  /** Upcoming Rehearsals have not ended yet; past ones have. */
  when: "upcoming" | "past"
  choirGroupId?: string
}

export type RehearsalSchedule = Awaited<ReturnType<typeof getRehearsalSchedule>>
export type ScheduledRehearsal = RehearsalSchedule["rehearsals"][number]

// shortcut: the list is capped rather than paged; add paging if a Choir's history outgrows it.
const LIST_LIMIT = 200

/**
 * Events whose only Target is one whole Choir, with that Choir, as an SQL subquery. Together with
 * type Rehearsal and a Series, this is exactly what `event.scheduleRehearsals` holders manage.
 */
function soleChoirTargets(database: Database) {
  return database
    .select({
      eventId: eventTarget.eventId,
      choirGroupId: sql<string>`min(${eventTarget.groupId}::text)`.as("choir_group_id")
    })
    .from(eventTarget)
    .leftJoin(group, eq(group.id, eventTarget.groupId))
    .groupBy(eventTarget.eventId)
    .having(sql`count(*) = 1 and bool_and(${group.type} = ${GroupType.Choir} and ${eventTarget.voiceFamily} is null)`)
    .as("sole_choir_target")
}

/**
 * The tool's page: the Choirs to schedule for, the Locations to pick from, and the Series
 * Rehearsals of the filtered Choir, upcoming soonest first or past most recent first.
 */
export async function getRehearsalSchedule(filters: ScheduleFilters, now: Date, database: Database = db) {
  return withRehearsalSchedulePermission(async (tx, { access, eventContext }) => {
    const labels = await listLocalizedGroupLabels(tx)
    const choirs = (await listActiveGroups(tx))
      .filter(({ type }) => type === GroupType.Choir)
      .map(({ id }) => ({ id, name: labels.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"))

    const target = soleChoirTargets(tx)
    const upcoming = filters.when === "upcoming"
    const rows = await tx
      .select({
        id: event.id,
        title: event.title,
        status: event.status,
        type: event.type,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        locationId: event.locationId,
        locationText: event.locationText,
        organiserGroupId: event.organiserGroupId,
        seriesId: event.seriesId,
        seriesName: eventSeries.name,
        choirGroupId: target.choirGroupId
      })
      .from(event)
      .innerJoin(target, eq(target.eventId, event.id))
      .innerJoin(eventSeries, eq(eventSeries.id, event.seriesId))
      .where(
        and(
          eq(event.type, "Rehearsal"),
          upcoming ? gt(event.endsAt, now) : lte(event.endsAt, now),
          filters.choirGroupId ? eq(target.choirGroupId, filters.choirGroupId) : undefined
        )
      )
      .orderBy(upcoming ? asc(event.startsAt) : desc(event.startsAt), asc(event.title))
      .limit(LIST_LIMIT)
      .for("share", { of: event })

    const rehearsals = rows
      .filter((row) =>
        access.can({
          action: "event.read",
          context: eventContext({ ...row, targets: [{ groupId: row.choirGroupId, voiceFamily: null }] })
        })
      )
      .map(({ type: _type, organiserGroupId: _organiser, seriesId: _series, ...row }) => ({
        ...row,
        choirName: labels.get(row.choirGroupId) ?? row.choirGroupId
      }))

    const usedLocations = [...new Set(rehearsals.flatMap(({ locationId }) => (locationId ? [locationId] : [])))]
    const locations = await tx
      .select({ id: location.id, name: location.name, active: location.active })
      .from(location)
      .where(or(eq(location.active, true), usedLocations.length > 0 ? inArray(location.id, usedLocations) : undefined))
      .orderBy(asc(location.name))

    return { choirs, locations, rehearsals, today: stockholmDate(now) }
  }, database)
}

/**
 * The dates on which the Choir already has a Rehearsal that is not Cancelled, in a Series or not,
 * so the generator's preview can leave them unticked. The caller establishes
 * `event.scheduleRehearsals` in the same transaction.
 */
export async function takenRehearsalDates(database: Database, choirGroupId: string, dates: readonly IsoDate[]) {
  if (dates.length === 0) return new Set<IsoDate>()
  const sorted = [...dates].sort()
  const from = stockholmInstant(sorted[0] as IsoDate)
  const until = stockholmInstant(addDays(sorted.at(-1) as IsoDate, 1))
  if (!from || !until) return new Set<IsoDate>()
  const rows = await database
    .selectDistinct({ startsAt: event.startsAt })
    .from(event)
    .innerJoin(eventTarget, eq(eventTarget.eventId, event.id))
    .where(
      and(
        eq(event.type, "Rehearsal"),
        ne(event.status, "Cancelled"),
        eq(eventTarget.groupId, choirGroupId),
        isNull(eventTarget.voiceFamily),
        gt(event.endsAt, from),
        lt(event.startsAt, until)
      )
    )
  const wanted = new Set(dates)
  return new Set(rows.map(({ startsAt }) => stockholmDate(startsAt)).filter((date) => wanted.has(date)))
}
