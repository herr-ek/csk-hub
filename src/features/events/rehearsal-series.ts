import "server-only"

import { eventSeries } from "@/core/db/schema/events"
import { GroupType } from "@/core/org-structure"
import { lockGroupForReference } from "@/features/org-structure"
import { createEvent } from "./events"
import { type IsoDate, isIsoDate, MAX_SERIES_DATES, stockholmDate, stockholmInstant } from "./model"
import { type EventsDatabase, RuleViolation, runEventCommand } from "./operation"

/** One generator run: a Choir's weekly Rehearsals on the chosen dates, at one Stockholm time. */
export type RehearsalSeriesInput = {
  name: string
  choirGroupId: string
  title: string
  dates: readonly IsoDate[]
  /** Wall-clock `HH:mm` in Europe/Stockholm, the same on every date. */
  startTime: string
  endTime: string
  locationId?: string | null
  createdBy: string | null
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Creates a Series and one Draft Rehearsal on each date, all or nothing. Each Rehearsal is for the
 * whole Choir alone, organised by it, with the type's default Participation mode. Refused without
 * dates, with more than `MAX_SERIES_DATES`, with a date before `today`, or when the end is not
 * after the start; the Choir must be an active Choir group.
 */
export function createRehearsalSeries(
  database: EventsDatabase,
  input: RehearsalSeriesInput,
  today: IsoDate = stockholmDate(new Date())
) {
  return runEventCommand(database, async (tx) => {
    const dates = [...new Set(input.dates)].sort()
    if (dates.length === 0) throw new RuleViolation("no-dates")
    if (dates.length > MAX_SERIES_DATES) throw new RuleViolation("too-many-dates")
    if (!dates.every(isIsoDate) || !TIME.test(input.startTime) || !TIME.test(input.endTime)) {
      throw new RuleViolation("invalid-date")
    }
    if ((dates[0] as IsoDate) < today) throw new RuleViolation("date-in-past")
    if (input.endTime <= input.startTime) throw new RuleViolation("ends-before-start")

    const choir = await lockGroupForReference(tx, input.choirGroupId)
    if (!choir) throw new RuleViolation("target-group-not-found")
    if (choir.type !== GroupType.Choir) throw new RuleViolation("not-a-choir")
    if (!choir.active) throw new RuleViolation("target-group-archived")

    const [series] = await tx.insert(eventSeries).values({ name: input.name.trim() }).returning({ id: eventSeries.id })
    if (!series) throw new Error("Series creation did not return a record.")

    for (const date of dates) {
      const startsAt = stockholmInstant(`${date}T${input.startTime}`)
      const endsAt = stockholmInstant(`${date}T${input.endTime}`)
      // A wall-clock time skipped by the change to summer time has no instant.
      if (!startsAt || !endsAt) throw new RuleViolation("invalid-date")
      const created = await createEvent(tx, {
        type: "Rehearsal",
        title: input.title,
        schedule: { allDay: false, startsAt, endsAt },
        locationId: input.locationId ?? null,
        organiserGroupId: input.choirGroupId,
        targets: [{ groupId: input.choirGroupId, voiceFamily: null }],
        createdBy: input.createdBy,
        seriesId: series.id
      })
      if (!created.success) throw new RuleViolation(created.error)
    }
    return { seriesId: series.id, count: dates.length }
  })
}
