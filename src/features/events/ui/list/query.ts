import "server-only"

import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm"
import { db } from "@/core/db"
import { event, eventTarget } from "@/core/db/schema/events"
import { listGroupNames } from "@/features/org-structure"
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
      organiserGroupId: event.organiserGroupId
    })
    .from(event)
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
          .select({ eventId: eventTarget.eventId, groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
          .from(eventTarget)
          .where(
            inArray(
              eventTarget.eventId,
              rows.map(({ id }) => id)
            )
          )

  const groupIds = [...rows.map(({ organiserGroupId }) => organiserGroupId), ...targets.map(({ groupId }) => groupId)]
  const groupNames = new Map(
    (
      await listGroupNames(
        db,
        groupIds.filter((id): id is string => id !== null)
      )
    ).map(({ id, name }) => [id, name])
  )
  const nameOf = (groupId: string | null) => (groupId ? (groupNames.get(groupId) ?? null) : null)

  return rows.map(({ organiserGroupId, ...row }) => ({
    ...row,
    organiserGroup: nameOf(organiserGroupId),
    targets: targets
      .filter(({ eventId }) => eventId === row.id)
      .map(({ groupId, voiceFamily }) => ({ group: nameOf(groupId), voiceFamily: voiceFamily as VoiceFamily | null }))
      .sort((a, b) => byPresentValue(a.group, b.group) || byPresentValue(a.voiceFamily, b.voiceFamily))
  }))
}

/** Ascending, with absent values last, as SQL orders them. */
function byPresentValue(a: string | null, b: string | null) {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b, "sv")
}
