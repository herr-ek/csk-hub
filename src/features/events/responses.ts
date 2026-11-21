import "server-only"

import { and, asc, eq, isNull, or } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { absenceReason, event, eventResponse, eventTarget } from "@/core/db/schema/events"
import { listGroupNames, listMembershipsOfUser, listMembershipsOnDate } from "@/features/org-structure"
import type { VoiceFamily } from "@/features/voice/model"
import { type AudienceMembership, type AudienceTarget, inAudience } from "./audience"
import { collectsResponses, type ParticipationMode, type RsvpAnswer, stockholmDate } from "./model"
import { type EventsDatabase, type EventsTransaction, optionalText, RuleViolation, runEventCommand } from "./operation"

/** A User's answer to an Event. The comment goes with any answer; a reason only with No. */
export type ResponseInput = {
  answer: RsvpAnswer
  comment?: string | null
  absenceReasonId?: string | null
  reasonText?: string | null
}

/**
 * Gives the User's Response to an Event, or replaces the one they gave; a Response is never
 * removed. Only a Published Event in a response mode, only before it starts, and only from its
 * Audience. Answering after the respond-by deadline is accepted and reported as late.
 */
export function respondToEvent(
  database: EventsDatabase,
  userId: string,
  eventId: string,
  input: ResponseInput,
  now: Date = new Date()
) {
  return runEventCommand(database, async (tx) => {
    const [row] = await tx
      .select({
        status: event.status,
        participationMode: event.participationMode,
        startsAt: event.startsAt,
        respondBy: event.respondBy
      })
      .from(event)
      .where(eq(event.id, eventId))
      .for("share")
    if (!row) throw new RuleViolation("event-not-found")
    const targets = await audienceTargets(tx, eventId)
    const memberships = await listMembershipsOfUser(tx, userId, { from: stockholmDate(row.startsAt) })
    if (!inAudience(memberships, { startsAt: row.startsAt, targets }, now)) throw new RuleViolation("not-in-audience")
    if (row.status !== "Published" || !collectsResponses(row.participationMode)) {
      throw new RuleViolation("responses-closed")
    }
    // After the start, what happened is Attendance, not a Response.
    if (now >= row.startsAt) throw new RuleViolation("event-started")

    const values = await responseValues(tx, userId, eventId, row.participationMode, input)
    await tx
      .insert(eventResponse)
      .values({ eventId, userId, ...values, respondedAt: now })
      .onConflictDoUpdate({
        target: [eventResponse.eventId, eventResponse.userId],
        set: { ...values, respondedAt: now }
      })
    return { late: row.respondBy !== null && now > row.respondBy }
  })
}

async function responseValues(
  tx: EventsTransaction,
  userId: string,
  eventId: string,
  mode: ParticipationMode,
  input: ResponseInput
) {
  const comment = optionalText(input.comment)
  const reasonText = optionalText(input.reasonText)
  const absenceReasonId = input.absenceReasonId || null
  if (input.answer !== "No" && (absenceReasonId || reasonText)) throw new RuleViolation("reason-only-with-no")
  if (absenceReasonId && reasonText) throw new RuleViolation("absence-reason-conflict")
  if (mode === "ResponseRequiredStrict") {
    if (input.answer === "Maybe") throw new RuleViolation("maybe-not-allowed")
    if (input.answer === "No" && !absenceReasonId && !reasonText) throw new RuleViolation("absence-reason-required")
  }
  if (absenceReasonId) await requirePickableReason(tx, absenceReasonId, userId, eventId)
  return { answer: input.answer, comment, absenceReasonId, reasonText }
}

/** An active reason, or the archived one the User's Response already has, so keeping it is no change. */
async function requirePickableReason(tx: EventsTransaction, reasonId: string, userId: string, eventId: string) {
  const [reason] = await tx
    .select({ active: absenceReason.active })
    .from(absenceReason)
    .where(eq(absenceReason.id, reasonId))
    .for("share")
  if (!reason) throw new RuleViolation("absence-reason-not-found")
  if (reason.active) return
  const [kept] = await tx
    .select({ id: eventResponse.id })
    .from(eventResponse)
    .where(
      and(
        eq(eventResponse.eventId, eventId),
        eq(eventResponse.userId, userId),
        eq(eventResponse.absenceReasonId, reasonId)
      )
    )
  if (!kept) throw new RuleViolation("absence-reason-archived")
}

/** Creates an active Absence reason. Labels are unique among active reasons. */
export function createAbsenceReason(database: EventsDatabase, input: { label: string }) {
  return runEventCommand(database, async (tx) => {
    const [created] = await tx
      .insert(absenceReason)
      .values({ label: input.label.trim() })
      .returning({ id: absenceReason.id })
    if (!created) throw new Error("Absence reason creation did not return a record.")
    return created
  })
}

/** Renames an active Absence reason. Responses that use it show the new label. */
export function renameAbsenceReason(database: EventsDatabase, reasonId: string, input: { label: string }) {
  return runEventCommand(database, async (tx) => {
    await requireActiveReason(tx, reasonId)
    await tx.update(absenceReason).set({ label: input.label.trim() }).where(eq(absenceReason.id, reasonId))
  })
}

/**
 * Archives an Absence reason; they are never deleted. Responses that use it keep it, but it is no
 * longer offered.
 */
export function archiveAbsenceReason(database: EventsDatabase, reasonId: string) {
  return runEventCommand(database, async (tx) => {
    await requireActiveReason(tx, reasonId)
    await tx.update(absenceReason).set({ active: false }).where(eq(absenceReason.id, reasonId))
  })
}

async function requireActiveReason(tx: EventsTransaction, reasonId: string) {
  const [row] = await tx
    .select({ active: absenceReason.active })
    .from(absenceReason)
    .where(eq(absenceReason.id, reasonId))
    .for("update")
  if (!row) throw new RuleViolation("absence-reason-not-found")
  if (!row.active) throw new RuleViolation("absence-reason-archived")
}

/**
 * Every Response to an Event, with its User's name and its preset reason's label, by name. Comments
 * and reasons are private to the User and the organisers: a read for the Audience must drop them.
 */
export function listResponses(database: EventsDatabase, eventId: string) {
  return database
    .select({
      userId: eventResponse.userId,
      // Null after Erasure.
      name: user.name,
      answer: eventResponse.answer,
      comment: eventResponse.comment,
      absenceReasonId: eventResponse.absenceReasonId,
      reasonLabel: absenceReason.label,
      reasonText: eventResponse.reasonText,
      respondedAt: eventResponse.respondedAt
    })
    .from(eventResponse)
    .leftJoin(user, eq(user.id, eventResponse.userId))
    .leftJoin(absenceReason, eq(absenceReason.id, eventResponse.absenceReasonId))
    .where(eq(eventResponse.eventId, eventId))
    .orderBy(asc(user.name), asc(eventResponse.id))
}

/** The active Absence reasons a User may pick, plus the archived one they already have, by label. */
export function listPickableAbsenceReasons(database: EventsDatabase, keptId: string | null) {
  return database
    .select({ id: absenceReason.id, label: absenceReason.label })
    .from(absenceReason)
    .where(or(eq(absenceReason.active, true), keptId ? eq(absenceReason.id, keptId) : undefined))
    .orderBy(asc(absenceReason.label))
}

/**
 * The active Users in an Event's Audience, by the rule `inAudience` applies to one User. Inactive
 * Users are left out: they can no longer answer.
 */
export async function listActiveAudience(
  database: EventsDatabase,
  eventRow: { id: string; startsAt: Date },
  now: Date = new Date()
) {
  const targets = await audienceTargets(database, eventRow.id)
  // shortcut: reads every active User; fine at CSK's size, narrow by Membership if it grows.
  const users = await database
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)))
  // No Targets: everyone in CSK, Membership or not.
  if (targets.length === 0) return users

  const groupIds = targets.some(({ groupId }) => groupId === null)
    ? null
    : targets.map(({ groupId }) => groupId as string)
  const byUser = new Map<string, AudienceMembership[]>()
  for (const { userId, ...membership } of await listMembershipsOnDate(
    database,
    stockholmDate(eventRow.startsAt),
    groupIds
  )) {
    byUser.set(userId, [...(byUser.get(userId) ?? []), membership])
  }
  const audienceEvent = { startsAt: eventRow.startsAt, targets }
  return users.filter(({ id }) => byUser.has(id) && inAudience(byUser.get(id) ?? [], audienceEvent, now))
}

/** An Event's Targets with their groups' types, which the Audience rule needs. */
async function audienceTargets(database: EventsDatabase, eventId: string): Promise<AudienceTarget[]> {
  const rows = await database
    .select({ groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
    .from(eventTarget)
    .where(eq(eventTarget.eventId, eventId))
  const groups = await listGroupNames(
    database,
    rows.flatMap(({ groupId }) => (groupId ? [groupId] : []))
  )
  return rows.map(({ groupId, voiceFamily }) => ({
    groupId,
    groupType: groups.find(({ id }) => id === groupId)?.type ?? null,
    voiceFamily: voiceFamily as VoiceFamily | null
  }))
}
