"use server"

import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { event, eventTarget } from "@/core/db/schema/events"
import { setEventLocation } from "../../events"
import { changeEventStatus, deleteEvent } from "../../lifecycle"
import { type IsoDate, MAX_SERIES_DATES, stockholmDate, WEEKDAYS, type Weekday, weeklyDates } from "../../model"
import { RuleViolation, runEventCommand } from "../../operation"
import { createRehearsalSeries } from "../../rehearsal-series"
import type { EventCommandState } from "../command-state"
import { runEventsCommand } from "../run-command"
import { takenRehearsalDates } from "./query"

export type PreviewDate = { date: IsoDate; taken: boolean }

const previewSchema = z.object({
  choirGroupId: z.uuid(),
  weekday: z.number().refine((day): day is Weekday => WEEKDAYS.includes(day as Weekday)),
  firstDay: z.string(),
  lastDay: z.string()
})

/** The dates a run would create, each flagged when the Choir already rehearses that day. */
export async function previewRehearsalSeriesAction(
  values: z.input<typeof previewSchema>
): Promise<{ state: EventCommandState; dates?: PreviewDate[] }> {
  const { state, data } = await runEventsCommand(
    "preview-rehearsal-series",
    previewSchema,
    values,
    async (input, _actorId, database) => {
      const dates = weeklyDates(input.weekday as Weekday, input.firstDay, input.lastDay, stockholmDate(new Date()))
      if (!dates.success) return dates
      const taken = await takenRehearsalDates(database, input.choirGroupId, dates.data)
      return { success: true, data: dates.data.map((date) => ({ date, taken: taken.has(date) })) }
    },
    "event.scheduleRehearsals"
  )
  return { state, dates: data }
}

const seriesSchema = z.object({
  name: z.string(),
  choirGroupId: z.uuid(),
  title: z.string(),
  dates: z.array(z.string()).max(MAX_SERIES_DATES),
  startTime: z.string(),
  endTime: z.string(),
  locationId: z.uuid().nullable()
})

/** Creates the Series of Draft Rehearsals on the ticked dates. */
export async function createRehearsalSeriesAction(values: z.input<typeof seriesSchema>): Promise<EventCommandState> {
  const { state } = await runEventsCommand(
    "create-rehearsal-series",
    seriesSchema,
    values,
    (input, actorId, database) => createRehearsalSeries(database, { ...input, createdBy: actorId }),
    "event.scheduleRehearsals"
  )
  return state
}

const locationSchema = z.object({ eventId: z.uuid(), locationId: z.uuid().nullable() })

/** Changes one Rehearsal's Location, as an update keeping everything else the Event has. */
export async function setRehearsalLocationAction(values: z.input<typeof locationSchema>): Promise<EventCommandState> {
  const { state } = await runEventsCommand(
    "set-rehearsal-location",
    locationSchema,
    values,
    (input, _actorId, database) => setEventLocation(database, input.eventId, input.locationId),
    (input) => ({ action: "event.update", eventId: input.eventId })
  )
  return state
}

/** Deletes one Rehearsal and stays on the schedule, unlike the Event page's delete. */
export async function deleteRehearsalAction(_state: EventCommandState, formData: FormData): Promise<EventCommandState> {
  const { state } = await runEventsCommand(
    "delete-rehearsal",
    z.object({ eventId: z.uuid() }),
    { eventId: formData.get("eventId") },
    (input, _actorId, database) => deleteEvent(database, input.eventId),
    (input) => ({ action: "event.delete", eventId: input.eventId })
  )
  return state
}

/**
 * Publishes the listed Drafts, all or nothing. Each is locked and checked against
 * `event.changeStatus`; any that is no longer a Draft is left as it is.
 */
export async function publishRehearsalDraftsAction(
  _state: EventCommandState,
  formData: FormData
): Promise<EventCommandState> {
  const { state } = await runEventsCommand(
    "publish-rehearsal-drafts",
    z.object({ eventIds: z.array(z.uuid()).min(1) }),
    { eventIds: formData.getAll("eventId") },
    (input, _actorId, database, schedule) =>
      runEventCommand(database, async (tx) => {
        if (!schedule) throw new Error("The rehearsal schedule scope is missing.")
        const drafts = await tx
          .select({
            id: event.id,
            organiserGroupId: event.organiserGroupId,
            type: event.type,
            seriesId: event.seriesId
          })
          .from(event)
          .where(and(inArray(event.id, input.eventIds), eq(event.status, "Draft")))
          .orderBy(event.id)
          .for("update")
        const targets = await tx
          .select({ eventId: eventTarget.eventId, groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
          .from(eventTarget)
          .where(inArray(eventTarget.eventId, input.eventIds))
        for (const draft of drafts) {
          const context = schedule.eventContext({
            ...draft,
            targets: targets.filter(({ eventId }) => eventId === draft.id)
          })
          schedule.access.requirePermission({ action: "event.changeStatus", context })
          const published = await changeEventStatus(tx, draft.id, "Published")
          // Raised rather than returned, so the Drafts already published roll back with it.
          if (!published.success) throw new RuleViolation(published.error)
        }
        return drafts.length
      }),
    "event.scheduleRehearsals"
  )
  return state
}
