import "server-only"

import { eq } from "drizzle-orm"
import { can } from "@/core/authz"
import { db } from "@/core/db"
import { event } from "@/core/db/schema/events"
import { collectsResponses, type RsvpAnswer } from "../../model"
import { listActiveAudience, listResponses } from "../../responses"

export type EventResponsesView = NonNullable<Awaited<ReturnType<typeof getEventResponses>>>

/**
 * Every Response to an Event with its comment, reason and late flag, and the active Audience
 * members who have not answered, for Admins only. Null for anyone else, and for an Event that
 * collects no Responses and has none.
 */
export async function getEventResponses(eventId: string, now: Date = new Date()) {
  // shortcut: Admin-only for now; delegated Event managers get this view with their own policy.
  if (!(await can({ action: "event.administer" }))) return null
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: event.id,
        participationMode: event.participationMode,
        startsAt: event.startsAt,
        respondBy: event.respondBy
      })
      .from(event)
      .where(eq(event.id, eventId))
    if (!row) return null
    const responses = await listResponses(tx, row.id)
    if (!collectsResponses(row.participationMode) && responses.length === 0) return null

    const audience = await listActiveAudience(tx, row, now)
    const answered = new Set(responses.map(({ userId }) => userId))
    const count = (answer: RsvpAnswer) => responses.filter((response) => response.answer === answer).length
    return {
      counts: { Yes: count("Yes"), No: count("No"), Maybe: count("Maybe") },
      responses: responses.map((response) => ({
        ...response,
        late: row.respondBy !== null && response.respondedAt > row.respondBy
      })),
      notAnswered: audience.filter(({ id }) => !answered.has(id)).sort((a, b) => a.name.localeCompare(b.name, "sv"))
    }
  })
}
