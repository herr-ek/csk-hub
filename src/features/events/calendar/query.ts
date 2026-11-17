import "server-only"

import { and, asc, eq, gt, inArray, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"
import { forCurrentRequest } from "@/core/authz"
import { evaluatePermission } from "@/core/authz/policy-registry"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { event, eventDetail, eventTarget, gig, location, rehearsal, socialEvent } from "@/core/db/schema/events"
import {
  getGroupAuthorizationFacts,
  listGroupNames,
  listLocalizedGroupLabels,
  listMembershipsOfUser,
  lockGroupAuthorizationFacts
} from "@/features/org-structure"
import type { RichTextDocument } from "@/features/rich-text"
import type { VoiceFamily } from "@/features/voice/model"
import { eventGroupContext } from "../access"
import type { AudienceTarget } from "../audience"
import {
  byPresentValue,
  type EventStatus,
  type EventType,
  type RehearsalKind,
  rehearsalKind,
  stockholmDate
} from "../model"
import type { EventsDatabase } from "../operation"

/** A Target as the calendar shows it: the group's name for the words, its type for the rules. */
export type CalendarTarget = AudienceTarget & { groupName: string | null }

/** One Event in a User's list of upcoming Events. */
export type UpcomingEvent = {
  id: string
  title: string
  type: EventType
  /** Set exactly on a Rehearsal: how it is labelled instead of its type. */
  rehearsalKind: RehearsalKind | null
  status: Extract<EventStatus, "Published" | "Cancelled">
  startsAt: Date
  endsAt: Date
  allDay: boolean
  /** The Event's own location text when set, otherwise its Location's name. */
  location: string | null
}

export type UpcomingEvents = { events: UpcomingEvent[] }

/**
 * The Events a User is in the Audience of that have not ended by `now`, ongoing ones included,
 * soonest first. Only Published and Cancelled Events: a Draft never appears. The Audience is
 * computed from each Event's Targets and the User's Memberships on the Event's start date.
 */
export async function listUpcomingEventsForUser(
  database: EventsDatabase,
  userId: string,
  now: Date,
  isAdmin = false
): Promise<UpcomingEvents> {
  const rows = await database
    .select({
      id: event.id,
      title: event.title,
      type: event.type,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      organiserGroupId: event.organiserGroupId,
      seriesId: event.seriesId,
      locationText: event.locationText,
      locationName: location.name
    })
    .from(event)
    .leftJoin(location, eq(location.id, event.locationId))
    .where(and(ne(event.status, "Draft"), gt(event.endsAt, now)))
    .orderBy(asc(event.startsAt), asc(event.title), asc(event.id))
    .for("share", { of: event })

  const today = stockholmDate(now)
  // An ongoing Event counts the Memberships of the day it started.
  const earliest = rows.reduce((from, row) => minDate(from, stockholmDate(row.startsAt)), today)
  const targets = await targetsOf(
    database,
    rows.map(({ id }) => id)
  )
  const memberships = await listMembershipsOfUser(database, userId, { from: earliest })

  const facts = await getGroupAuthorizationFacts(database, userId)
  const events = rows.flatMap((row) => {
    const eventTargets = targets.get(row.id) ?? []
    if (
      !evaluatePermission(
        { userId, isAdmin },
        {
          action: "event.view",
          context: {
            ...eventGroupContext(facts, row.organiserGroupId),
            event: row,
            targets: eventTargets,
            audienceMemberships: memberships,
            now
          }
        }
      )
    )
      return []
    return [
      {
        id: row.id,
        title: row.title,
        type: row.type,
        rehearsalKind:
          row.type === "Rehearsal" ? rehearsalKind({ seriesId: row.seriesId, targets: eventTargets }) : null,
        status: row.status as UpcomingEvent["status"],
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        allDay: row.allDay,
        location: row.locationText ?? row.locationName
      }
    ]
  })
  return { events }
}

/** Who is looking at an Event page. Admins may open any Event that is not a Draft. */
export type EventPageViewer = { userId: string; isAdmin: boolean }

export type EventPage = NonNullable<Awaited<ReturnType<typeof getEventPage>>>

const eventIdSchema = z.uuid()

const leader = alias(user, "leader")
const responsible = alias(user, "responsible")

/**
 * One Event as its Audience reads it, or null when the viewer may not see it: `eventId` names no
 * Event, it is a Draft, or the viewer is outside its Audience and not an Admin. The caller answers
 * every null the same way, so a hidden Event cannot be told from a missing one. A Gig's external
 * contact is personal data for organisers only and is never read here.
 */
export async function getEventPage(
  database: EventsDatabase,
  eventId: string,
  viewer: EventPageViewer,
  now: Date = new Date()
) {
  // Ids arrive from the address, so anything may.
  if (!eventIdSchema.safeParse(eventId).success) return null
  const [row] = await database
    .select({
      id: event.id,
      title: event.title,
      type: event.type,
      status: event.status,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      callTime: event.callTime,
      seriesId: event.seriesId,
      locationText: event.locationText,
      locationName: location.name,
      locationAddress: location.address,
      locationMapUrl: location.mapUrl,
      organiserGroupId: event.organiserGroupId,
      leaderName: leader.name,
      responsibleName: responsible.name,
      costInfo: socialEvent.costInfo
    })
    .from(event)
    .leftJoin(location, eq(location.id, event.locationId))
    .leftJoin(rehearsal, eq(rehearsal.eventId, event.id))
    .leftJoin(leader, eq(leader.id, rehearsal.leaderUserId))
    .leftJoin(gig, eq(gig.eventId, event.id))
    .leftJoin(responsible, eq(responsible.id, gig.responsibleUserId))
    .leftJoin(socialEvent, eq(socialEvent.eventId, event.id))
    .where(eq(event.id, eventId))
    .for("share", { of: event })
  if (!row || row.status === "Draft") return null

  const targetsByEvent = await targetsOf(database, [row.id])
  const organiser = await groupsById(database, row.organiserGroupId ? [row.organiserGroupId] : [])
  const targets = targetsByEvent.get(row.id) ?? []
  const memberships = await listMembershipsOfUser(database, viewer.userId, { from: stockholmDate(row.startsAt) })
  const facts = await getGroupAuthorizationFacts(database, viewer.userId)
  const context = {
    ...eventGroupContext(facts, row.organiserGroupId),
    event: row,
    targets,
    audienceMemberships: memberships,
    now
  }
  if (!evaluatePermission(viewer, { action: "event.view", context })) return null
  const canManage = evaluatePermission(viewer, { action: "event.read", context })

  const details = await database
    .select({ label: eventDetail.label, value: eventDetail.value })
    .from(eventDetail)
    .where(eq(eventDetail.eventId, row.id))
    .orderBy(asc(eventDetail.sortOrder), asc(eventDetail.id))

  return {
    canManage,
    id: row.id,
    title: row.title,
    type: row.type,
    rehearsalKind: row.type === "Rehearsal" ? rehearsalKind({ seriesId: row.seriesId, targets }) : null,
    status: row.status as UpcomingEvent["status"],
    description: row.description as RichTextDocument | null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    callTime: row.callTime,
    locationText: row.locationText,
    location: row.locationName
      ? { name: row.locationName, address: row.locationAddress, mapUrl: row.locationMapUrl }
      : null,
    organiserGroup: row.organiserGroupId ? (organiser.get(row.organiserGroupId)?.name ?? null) : null,
    details,
    // Each is set only on its own type: a Rehearsal's leader, a Gig's responsible User, a Social's cost.
    leaderName: row.type === "Rehearsal" ? row.leaderName : null,
    responsibleName: row.type === "Gig" ? row.responsibleName : null,
    costInfo: row.type === "Social" ? row.costInfo : null,
    targets: targets.map(({ groupName, voiceFamily }) => ({ groupName, voiceFamily }))
  }
}

/** The Targets of each Event, with their groups' names and types, by group name. */
async function targetsOf(database: EventsDatabase, eventIds: string[]) {
  const byEvent = new Map<string, CalendarTarget[]>()
  if (eventIds.length === 0) return byEvent
  const rows = await database
    .select({ eventId: eventTarget.eventId, groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
    .from(eventTarget)
    .where(inArray(eventTarget.eventId, eventIds))
  const groups = await groupsById(
    database,
    rows.flatMap(({ groupId }) => (groupId ? [groupId] : []))
  )
  const targets = rows.map(({ eventId, groupId, voiceFamily }) => {
    const found = groupId ? groups.get(groupId) : undefined
    return {
      eventId,
      groupId,
      groupType: found?.type ?? null,
      groupName: found?.name ?? null,
      voiceFamily: voiceFamily as VoiceFamily | null
    }
  })
  targets.sort((a, b) => byPresentValue(a.groupName, b.groupName) || byPresentValue(a.voiceFamily, b.voiceFamily))
  for (const { eventId, ...target } of targets) {
    const list = byEvent.get(eventId) ?? []
    list.push(target)
    byEvent.set(eventId, list)
  }
  return byEvent
}

/** Group names and types through org-structure, which alone reads its tables. */
async function groupsById(database: EventsDatabase, groupIds: string[]) {
  const labels = await listLocalizedGroupLabels(database)
  return new Map(
    (await listGroupNames(database, groupIds)).map((found) => [
      found.id,
      { ...found, name: labels.get(found.id) ?? found.id }
    ])
  )
}

function minDate(a: string, b: string) {
  return a < b ? a : b
}

/** Protected calendar collection: derive fresh active identity instead of accepting browser claims. */
export async function listCurrentUpcomingEvents(now: Date, database: EventsDatabase = db) {
  return database.transaction(async (tx) => {
    const access = await forCurrentRequest(tx)
    const actor = access.requirePermission({ action: "app.access" })
    await lockGroupAuthorizationFacts(tx, actor.userId, [])
    return listUpcomingEventsForUser(tx, actor.userId, now, actor.isAdmin)
  })
}

/** Protected calendar detail; hidden resources map to null without exposing authz diagnostics. */
export async function getCurrentEventPage(eventId: string, now: Date, database: EventsDatabase = db) {
  return database.transaction(async (tx) => {
    const access = await forCurrentRequest(tx)
    const actor = access.requirePermission({ action: "app.access" })
    await lockGroupAuthorizationFacts(tx, actor.userId, [])
    return getEventPage(tx, eventId, actor, now)
  })
}
