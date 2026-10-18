import "server-only"

import { eq } from "drizzle-orm"
import { event, eventAttendance, eventRegistration, eventResponse } from "@/core/db/schema/events"
import { type EventStatus, statusChangesFrom } from "./model"
import { type EventsDatabase, RuleViolation, runEventCommand } from "./operation"

/**
 * Moves an Event along its lifecycle: Draft → Published to publish, Published → Cancelled to
 * cancel, and Cancelled → Published to reinstate. Anything else, such as a Published Event back
 * to Draft, is refused as `status-change-not-allowed`. Cancelling keeps the Event and everything
 * recorded for it.
 */
export function changeEventStatus(database: EventsDatabase, eventId: string, status: EventStatus) {
  return runEventCommand(database, async (tx) => {
    const [row] = await tx.select({ status: event.status }).from(event).where(eq(event.id, eventId)).for("update")
    if (!row) throw new RuleViolation("event-not-found")
    if (!statusChangesFrom(row.status).includes(status)) throw new RuleViolation("status-change-not-allowed")
    await tx.update(event).set({ status }).where(eq(event.id, eventId))
  })
}

/**
 * Deletes an Event in any status, with everything recorded for it: Responses, Registrations and
 * Attendance included. The database never refuses, so a caller warns first with
 * `getEventDeletionImpact`.
 */
export function deleteEvent(database: EventsDatabase, eventId: string) {
  return runEventCommand(database, async (tx) => {
    const deleted = await tx.delete(event).where(eq(event.id, eventId)).returning({ id: event.id })
    if (deleted.length === 0) throw new RuleViolation("event-not-found")
  })
}

export type EventDeletionImpact = { responses: number; registrations: number; attendance: number }

/** How many Responses, Registrations and Attendance rows deleting the Event removes, or null without the Event. */
export async function getEventDeletionImpact(
  database: EventsDatabase,
  eventId: string
): Promise<EventDeletionImpact | null> {
  // One statement, since a transaction runs its queries one at a time.
  const counted = (table: typeof eventResponse | typeof eventRegistration | typeof eventAttendance) =>
    database.$count(table, eq(table.eventId, event.id))
  const [row] = await database
    .select({
      responses: counted(eventResponse),
      registrations: counted(eventRegistration),
      attendance: counted(eventAttendance)
    })
    .from(event)
    .where(eq(event.id, eventId))
  return row ?? null
}
