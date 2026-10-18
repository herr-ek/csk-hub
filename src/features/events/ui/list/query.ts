import "server-only"

import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm"
import { db } from "@/core/db"
import { event, eventTarget } from "@/core/db/schema/events"
import { group } from "@/core/db/schema/org-structure"
import type { VoiceFamily } from "@/features/voice/model"
import type { EventStatus, EventType } from "../../model"

export type EventListFilters = {
  /** Upcoming Events have not ended yet; past ones have. */
  when: "upcoming" | "past"
  status?: EventStatus
  type?: EventType
}

export type EventListRow = Awaited<ReturnType<typeof listAdminEvents>>[number]

/**
 * Every Event in any status, filtered for the admin list: upcoming ones soonest first, past ones
 * most recent first. Each carries its Organiser group and its Targets with their group names.
 */
export async function listAdminEvents(filters: EventListFilters, now: Date) {
  const upcoming = filters.when === "upcoming"
  const rows = await db
    .select({
      id: event.id,
      title: event.title,
      type: event.type,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      organiserGroup: group.name
    })
    .from(event)
    .leftJoin(group, eq(group.id, event.organiserGroupId))
    .where(
      and(
        upcoming ? gt(event.endsAt, now) : lte(event.endsAt, now),
        filters.status ? eq(event.status, filters.status) : undefined,
        filters.type ? eq(event.type, filters.type) : undefined
      )
    )
    .orderBy(upcoming ? asc(event.startsAt) : desc(event.startsAt), asc(event.title))

  const targets =
    rows.length === 0
      ? []
      : await db
          .select({ eventId: eventTarget.eventId, group: group.name, voiceFamily: eventTarget.voiceFamily })
          .from(eventTarget)
          .leftJoin(group, eq(group.id, eventTarget.groupId))
          .where(
            inArray(
              eventTarget.eventId,
              rows.map(({ id }) => id)
            )
          )
          .orderBy(asc(group.name), asc(eventTarget.voiceFamily))

  return rows.map((row) => ({
    ...row,
    targets: targets
      .filter(({ eventId }) => eventId === row.id)
      .map(({ group, voiceFamily }) => ({ group, voiceFamily: voiceFamily as VoiceFamily | null }))
  }))
}
