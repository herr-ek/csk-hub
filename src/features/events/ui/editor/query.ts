import "server-only"

import { type AnyColumn, asc, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { event, eventDetail, eventTarget, gig, location, rehearsal, socialEvent } from "@/core/db/schema/events"
import { group } from "@/core/db/schema/org-structure"
import type { GroupType } from "@/features/org-structure/model"
import type { RichTextDocument } from "@/features/rich-text"
import { getEventDeletionImpact } from "../../lifecycle"
import {
  addDays,
  type EventStatus,
  type EventType,
  type IsoDate,
  type LocalDateTime,
  type ParticipationMode,
  stockholmDate,
  stockholmLocalDateTime
} from "../../model"

/** What the Event form shows, in the form's own terms: Stockholm wall-clock times and calendar dates. */
export type EventFormValues = {
  type: EventType
  title: string
  description: RichTextDocument | null
  allDay: boolean
  startsAt: LocalDateTime
  endsAt: LocalDateTime
  firstDay: IsoDate
  lastDay: IsoDate
  callTime: LocalDateTime
  respondBy: LocalDateTime
  participationMode: ParticipationMode
  locationId: string
  locationText: string
  organiserGroupId: string
  leaderUserId: string
  responsibleUserId: string
  contactName: string
  contactDetails: string
  costInfo: string
  targets: { groupId: string; voiceFamily: string }[]
  details: { label: string; value: string }[]
}

export type EventFormOptions = Awaited<ReturnType<typeof getEventFormOptions>>

// Choirs and their Sections first, as most Targets name them, then every other group.
const GROUP_TYPE_ORDER: Partial<Record<GroupType, number>> = { Choir: 0, Section: 1 }

/**
 * What the form's pickers offer: active Locations, groups and Users, plus any archived or Inactive
 * one the Event already uses, so editing it never silently drops a value.
 */
export async function getEventFormOptions(
  kept: { locationIds?: string[]; groupIds?: string[]; userIds?: string[] } = {}
) {
  const [locations, groups, users] = await Promise.all([
    db
      .select({ id: location.id, name: location.name, active: location.active })
      .from(location)
      .where(or(eq(location.active, true), keep(location.id, kept.locationIds)))
      .orderBy(asc(location.name)),
    db
      .select({ id: group.id, name: group.name, type: group.type, active: group.active })
      .from(group)
      .where(or(eq(group.active, true), keep(group.id, kept.groupIds))),
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(or(isNull(user.banned), eq(user.banned, false), keep(user.id, kept.userIds)))
      .orderBy(asc(user.name))
  ])

  return {
    locations,
    groups: groups.sort(
      (a, b) => (GROUP_TYPE_ORDER[a.type] ?? 2) - (GROUP_TYPE_ORDER[b.type] ?? 2) || a.name.localeCompare(b.name, "sv")
    ),
    users
  }
}

function keep(column: AnyColumn, ids: string[] | undefined) {
  return ids && ids.length > 0 ? inArray(column, ids) : undefined
}

/** A new Event's form: a timed Draft of the first type, with nothing filled in. */
export const EMPTY_EVENT_FORM: Omit<EventFormValues, "type" | "participationMode"> = {
  title: "",
  description: null,
  allDay: false,
  startsAt: "",
  endsAt: "",
  firstDay: "",
  lastDay: "",
  callTime: "",
  respondBy: "",
  locationId: "",
  locationText: "",
  organiserGroupId: "",
  leaderUserId: "",
  responsibleUserId: "",
  contactName: "",
  contactDetails: "",
  costInfo: "",
  targets: [],
  details: []
}

export type EventEditor = NonNullable<Awaited<ReturnType<typeof getEventEditor>>>

/** Everything the admin page of one Event shows and offers, or null when there is no such Event. */
export async function getEventEditor(eventId: string) {
  const [row] = await db
    .select({
      event,
      leaderUserId: rehearsal.leaderUserId,
      responsibleUserId: gig.responsibleUserId,
      contactName: gig.contactName,
      contactDetails: gig.contactDetails,
      costInfo: socialEvent.costInfo
    })
    .from(event)
    .leftJoin(rehearsal, eq(rehearsal.eventId, event.id))
    .leftJoin(gig, eq(gig.eventId, event.id))
    .leftJoin(socialEvent, eq(socialEvent.eventId, event.id))
    .where(eq(event.id, eventId))
  if (!row) return null

  const [targets, details, impact] = await Promise.all([
    db
      .select({ groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
      .from(eventTarget)
      .where(eq(eventTarget.eventId, eventId)),
    db
      .select({ label: eventDetail.label, value: eventDetail.value })
      .from(eventDetail)
      .where(eq(eventDetail.eventId, eventId))
      .orderBy(asc(eventDetail.sortOrder)),
    getEventDeletionImpact(db, eventId)
  ])
  const stored = row.event
  const userIds = [row.leaderUserId, row.responsibleUserId].filter((id): id is string => Boolean(id))
  const groupIds = [stored.organiserGroupId, ...targets.map(({ groupId }) => groupId)].filter((id): id is string =>
    Boolean(id)
  )
  const options = await getEventFormOptions({
    locationIds: stored.locationId ? [stored.locationId] : [],
    groupIds,
    userIds
  })

  const values: EventFormValues = {
    type: stored.type,
    title: stored.title,
    description: stored.description,
    allDay: stored.allDay,
    startsAt: stockholmLocalDateTime(stored.startsAt),
    endsAt: stockholmLocalDateTime(stored.endsAt),
    firstDay: stockholmDate(stored.startsAt),
    // An all-day Event ends at 00:00 after its last day; a timed one on the day it ends.
    lastDay: stored.allDay ? addDays(stockholmDate(stored.endsAt), -1) : stockholmDate(stored.endsAt),
    callTime: stored.callTime ? stockholmLocalDateTime(stored.callTime) : "",
    respondBy: stored.respondBy ? stockholmLocalDateTime(stored.respondBy) : "",
    participationMode: stored.participationMode,
    locationId: stored.locationId ?? "",
    locationText: stored.locationText ?? "",
    organiserGroupId: stored.organiserGroupId ?? "",
    leaderUserId: row.leaderUserId ?? "",
    responsibleUserId: row.responsibleUserId ?? "",
    contactName: row.contactName ?? "",
    contactDetails: row.contactDetails ?? "",
    costInfo: row.costInfo ?? "",
    targets: targets.map(({ groupId, voiceFamily }) => ({ groupId: groupId ?? "", voiceFamily: voiceFamily ?? "" })),
    details
  }

  return {
    id: stored.id,
    title: stored.title,
    status: stored.status as EventStatus,
    values,
    options,
    impact: impact ?? { responses: 0, registrations: 0, attendance: 0 }
  }
}
