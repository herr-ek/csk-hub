import "server-only"

import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { event, eventDetail, eventTarget, gig, location, rehearsal, socialEvent } from "@/core/db/schema/events"
import { group } from "@/core/db/schema/org-structure"
import type { VoiceFamily } from "@/features/voice/model"
import { eventDocument } from "./event-document"
import {
  addDays,
  DEFAULT_PARTICIPATION_MODE,
  type EventType,
  type EventViolation,
  type IsoDate,
  type ParticipationMode,
  stockholmInstant
} from "./model"
import {
  type EventsDatabase,
  type EventsTransaction,
  RuleViolation,
  runEventCommand,
  optionalText as text
} from "./operation"

/**
 * When an Event happens. A timed Event takes its instants; an all-day Event takes calendar
 * dates, its first and last day, and is stored from 00:00 on the first day to 00:00 on the day
 * after the last, in Europe/Stockholm.
 */
export type EventSchedule =
  | { allDay: false; startsAt: Date; endsAt: Date }
  | { allDay: true; firstDay: IsoDate; lastDay: IsoDate }

/** One rule for who the Event is for: a group, a Voice family, or both. */
export type EventTargetInput = { groupId: string | null; voiceFamily: VoiceFamily | null }

/** One labelled value shown on the Event, such as "Dress code: Kavaj". */
export type EventDetailInput = { label: string; value: string }

/** Everything an Event form saves at once. Optional text that is blank is stored as absent. */
export type EventInput = {
  type: EventType
  title: string
  /** The editor's document, untrusted: parsed through the Events document schema, null when nothing is left to read. */
  description?: unknown
  schedule: EventSchedule
  callTime?: Date | null
  /** Only meaningful when the mode collects something; the database refuses one with mode None. */
  respondBy?: Date | null
  /** Omitted for the type's default. */
  participationMode?: ParticipationMode
  locationId?: string | null
  /** A detail such as "room 3", or a one-off place. */
  locationText?: string | null
  organiserGroupId?: string | null
  /** The fields of the type's extension. Only the ones for `type` are kept; the rest are ignored. */
  rehearsal?: { leaderUserId?: string | null }
  gig?: { responsibleUserId?: string | null; contactName?: string | null; contactDetails?: string | null }
  social?: { costInfo?: string | null }
  /** Who the Event is for. None means everyone in CSK. */
  targets?: EventTargetInput[]
  /** Shown in this order. */
  details?: EventDetailInput[]
}

/**
 * Creates a Draft with its extension row, Targets and Event details, in one transaction. Without
 * a Participation mode it takes the type's default. A Location and an Organiser group must be
 * active, as must every Target group.
 */
export function createEvent(database: EventsDatabase, input: EventInput & { createdBy: string | null }) {
  return runEventCommand(database, async (tx) => {
    const values = await eventValues(tx, input, undefined)
    const [created] = await tx
      .insert(event)
      .values({ ...values, status: "Draft", createdBy: input.createdBy })
      .returning({ id: event.id })
    if (!created) throw new Error("Event creation did not return a record.")
    await writeParts(tx, created.id, input, new Set())
    return created
  })
}

/**
 * Saves the whole form as one change: the fields, the extension fields, the Targets (replaced
 * as a set) and the Event details (replaced in order). Changing the type replaces the extension
 * row. The status is untouched; see `changeEventStatus`.
 *
 * What the Event already had is kept even if it has been archived since: its Location, its
 * Organiser group and its Target groups. Anything newly chosen must be active.
 */
export function updateEvent(database: EventsDatabase, eventId: string, input: EventInput) {
  return runEventCommand(database, async (tx) => {
    const [current] = await tx
      .select({ locationId: event.locationId, organiserGroupId: event.organiserGroupId })
      .from(event)
      .where(eq(event.id, eventId))
      .for("update")
    if (!current) throw new RuleViolation("event-not-found")
    const currentTargets = await tx
      .select({ groupId: eventTarget.groupId })
      .from(eventTarget)
      .where(eq(eventTarget.eventId, eventId))

    const values = await eventValues(tx, input, current)
    // The extension rows pin the Event's type through a foreign key, so they go before it changes.
    await deleteExtensions(tx, eventId)
    await tx.update(event).set(values).where(eq(event.id, eventId))
    await tx.delete(eventTarget).where(eq(eventTarget.eventId, eventId))
    await tx.delete(eventDetail).where(eq(eventDetail.eventId, eventId))
    const kept = new Set(currentTargets.flatMap(({ groupId }) => (groupId ? [groupId] : [])))
    await writeParts(tx, eventId, input, kept)
  })
}

type CurrentReferences = { locationId: string | null; organiserGroupId: string | null }

/** The Event row's columns from the input, after checking what the database cannot. */
async function eventValues(tx: EventsTransaction, input: EventInput, current: CurrentReferences | undefined) {
  const { startsAt, endsAt } = scheduleInstants(input.schedule)
  const locationId = input.locationId ?? null
  const organiserGroupId = input.organiserGroupId ?? null

  if (locationId) await requireLocation(tx, locationId, locationId === current?.locationId)
  if (organiserGroupId) {
    await requireGroup(tx, organiserGroupId, organiserGroupId === current?.organiserGroupId, {
      missing: "organiser-group-not-found",
      archived: "organiser-group-archived"
    })
  }

  return {
    type: input.type,
    title: input.title.trim(),
    description: descriptionOf(input.description),
    startsAt,
    endsAt,
    allDay: input.schedule.allDay,
    callTime: input.callTime ?? null,
    respondBy: input.respondBy ?? null,
    participationMode: input.participationMode ?? DEFAULT_PARTICIPATION_MODE[input.type],
    locationId,
    locationText: text(input.locationText),
    organiserGroupId
  }
}

/**
 * The description as the Events document schema keeps it. Nothing to read is stored as null, but
 * words the schema refuses outright, which the editor never sends, are refused rather than lost.
 */
function descriptionOf(value: unknown) {
  if (value == null) return null
  const document = eventDocument.normalize(value)
  if (!document && hasWords(value)) throw new RuleViolation("description-invalid")
  return document
}

function hasWords(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false
  const node = value as { text?: unknown; content?: unknown }
  if (typeof node.text === "string" && node.text.trim() !== "") return true
  return Array.isArray(node.content) && node.content.some(hasWords)
}

function scheduleInstants(schedule: EventSchedule) {
  if (!schedule.allDay) {
    if (Number.isNaN(schedule.startsAt.getTime()) || Number.isNaN(schedule.endsAt.getTime())) {
      throw new RuleViolation("invalid-date")
    }
    return { startsAt: schedule.startsAt, endsAt: schedule.endsAt }
  }
  const startsAt = stockholmInstant(schedule.firstDay)
  const lastDay = stockholmInstant(schedule.lastDay)
  if (!startsAt || !lastDay) throw new RuleViolation("invalid-date")
  return { startsAt, endsAt: stockholmInstant(addDays(schedule.lastDay, 1)) as Date }
}

/** The extension row, Targets and Event details of a new or cleared Event. */
async function writeParts(tx: EventsTransaction, eventId: string, input: EventInput, keptGroups: Set<string>) {
  await writeExtension(tx, eventId, input)

  const targets = input.targets ?? []
  for (const target of targets) {
    if (!target.groupId && !target.voiceFamily) throw new RuleViolation("target-empty")
  }
  const groupIds = [...new Set(targets.flatMap(({ groupId }) => (groupId ? [groupId] : [])))]
  for (const groupId of groupIds) {
    await requireGroup(tx, groupId, keptGroups.has(groupId), {
      missing: "target-group-not-found",
      archived: "target-group-archived"
    })
  }
  if (targets.length > 0) {
    await tx.insert(eventTarget).values(targets.map(({ groupId, voiceFamily }) => ({ eventId, groupId, voiceFamily })))
  }

  const details = (input.details ?? []).map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
  if (details.some(({ label, value }) => !label || !value)) throw new RuleViolation("detail-incomplete")
  if (details.length > 0) {
    await tx.insert(eventDetail).values(details.map((detail, index) => ({ eventId, ...detail, sortOrder: index })))
  }
}

async function writeExtension(tx: EventsTransaction, eventId: string, input: EventInput) {
  if (input.type === "Rehearsal") {
    const leaderUserId = await existingUser(tx, input.rehearsal?.leaderUserId)
    await tx.insert(rehearsal).values({ eventId, leaderUserId })
  } else if (input.type === "Gig") {
    const responsibleUserId = await existingUser(tx, input.gig?.responsibleUserId)
    await tx.insert(gig).values({
      eventId,
      responsibleUserId,
      contactName: text(input.gig?.contactName),
      contactDetails: text(input.gig?.contactDetails)
    })
  } else if (input.type === "Social") {
    await tx.insert(socialEvent).values({ eventId, costInfo: text(input.social?.costInfo) })
  }
}

async function deleteExtensions(tx: EventsTransaction, eventId: string) {
  await tx.delete(rehearsal).where(eq(rehearsal.eventId, eventId))
  await tx.delete(gig).where(eq(gig.eventId, eventId))
  await tx.delete(socialEvent).where(eq(socialEvent.eventId, eventId))
}

async function existingUser(tx: EventsTransaction, userId: string | null | undefined) {
  if (!userId) return null
  const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId))
  if (!row) throw new RuleViolation("user-not-found")
  return row.id
}

/** A Location the Event may use, locked against concurrent archiving. An archived one only if the Event already had it. */
async function requireLocation(tx: EventsTransaction, locationId: string, alreadyUsed: boolean) {
  const [row] = await tx
    .select({ active: location.active })
    .from(location)
    .where(eq(location.id, locationId))
    .for("share")
  if (!row) throw new RuleViolation("location-not-found")
  if (!row.active && !alreadyUsed) throw new RuleViolation("location-archived")
}

/** A group the Event may name, locked against concurrent archiving. An archived one only if the Event already had it. */
async function requireGroup(
  tx: EventsTransaction,
  groupId: string,
  alreadyUsed: boolean,
  violations: { missing: EventViolation; archived: EventViolation }
) {
  const [row] = await tx.select({ active: group.active }).from(group).where(eq(group.id, groupId)).for("share")
  if (!row) throw new RuleViolation(violations.missing)
  if (!row.active && !alreadyUsed) throw new RuleViolation(violations.archived)
}
