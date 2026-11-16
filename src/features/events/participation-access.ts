import "server-only"

import { eq } from "drizzle-orm"
import { z } from "zod"
import { AuthorizationDeniedError, forCurrentRequest } from "@/core/authz"
import type { PermissionContext } from "@/core/authz/model"
import { type Database, db } from "@/core/db"
import {
  attendanceStatus,
  event,
  eventAttendance,
  eventRegistration,
  eventRegistrationAnswer,
  eventRegistrationAnswerChoice,
  eventResponse,
  eventTarget
} from "@/core/db/schema/events"
import {
  listMembershipsOfUser,
  listPositionHoldingsForAuthorization,
  lockGroupAuthorizationFacts
} from "@/features/org-structure"
import { eventGroupContext } from "./access"
import { stockholmDate } from "./model"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Access = Awaited<ReturnType<typeof forCurrentRequest>>
type Participant = { eventId: string; userId: string | null }
type ReadAction = "event.readResponseReason" | "event.readRegistrationAnswers" | "event.readAttendance"

/** Load trusted resource, audience and Section facts under the same locks used by Event and org writers. */
async function participantContext(tx: Transaction, access: Access, eventId: string, subjectId: string | null) {
  const actor = access.requirePermission({ action: "app.access" })
  const [observed] = await tx
    .select({ organiserGroupId: event.organiserGroupId })
    .from(event)
    .where(eq(event.id, eventId))
  const initialHoldings = await listPositionHoldingsForAuthorization(tx, actor.userId)
  const ids = [observed?.organiserGroupId, ...initialHoldings.map(({ groupId }) => groupId)].filter(
    (id): id is string => Boolean(id)
  )
  const facts = await lockGroupAuthorizationFacts(tx, actor.userId, ids, subjectId ? [subjectId] : [])
  const [stored] = await tx.select().from(event).where(eq(event.id, eventId)).for("share")
  const stable = stored && stored.organiserGroupId === observed?.organiserGroupId
  const targets = await tx.select().from(eventTarget).where(eq(eventTarget.eventId, eventId))
  const sectionHoldings = await listPositionHoldingsForAuthorization(tx, actor.userId)
  const subjectMemberships = subjectId
    ? await listMembershipsOfUser(tx, subjectId, { from: stored ? stockholmDate(stored.startsAt) : "0001-01-01" })
    : []
  return {
    ...eventGroupContext(facts, stored?.organiserGroupId),
    event: stable ? stored : null,
    targets: targets.map((target) => ({
      groupId: target.groupId,
      voiceFamily: target.voiceFamily,
      groupType: facts.groups.find(({ id }) => id === target.groupId)?.type ?? null
    })),
    subjectMemberships,
    sections: facts.groups.filter(({ id }) => ids.includes(id)),
    sectionHoldings,
    now: new Date()
  } satisfies Omit<PermissionContext["event.readAttendance"], "record">
}

/** A record is locked after its Event, matching Event deletion and lifecycle lock ordering. */
async function readParticipant<T extends Participant, R>(
  load: (tx: Transaction, lock: boolean) => Promise<T | undefined>,
  action: ReadAction,
  project: (tx: Transaction, record: T) => Promise<R>,
  database: Database
): Promise<R | null> {
  try {
    return await database.transaction(async (tx) => {
      const access = await forCurrentRequest(tx)
      access.requirePermission({ action: "app.access" })
      const observed = await load(tx, false)
      if (!observed) return null
      const context = await participantContext(tx, access, observed.eventId, observed.userId)
      const record = await load(tx, true)
      if (!record || record.eventId !== observed.eventId || record.userId !== observed.userId) return null
      access.requirePermission({ action, context: { ...context, record } })
      return project(tx, record)
    })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  }
}

/** Private response fields, including comment and reason; null for absent or forbidden records. */
export async function getResponseDetails(responseId: string, database: Database = db) {
  if (!z.uuid().safeParse(responseId).success) return null
  return readParticipant(
    async (tx, lock) => {
      const query = tx.select().from(eventResponse).where(eq(eventResponse.id, responseId))
      const [row] = await (lock ? query.for("share") : query)
      return row
    },
    "event.readResponseReason",
    async (_tx, row) => row,
    database
  )
}

/** Registration comment and all answer kinds share one private boundary, including withdrawn registrations. */
export async function getRegistrationDetails(registrationId: string, database: Database = db) {
  if (!z.uuid().safeParse(registrationId).success) return null
  return readParticipant(
    async (tx, lock) => {
      const query = tx.select().from(eventRegistration).where(eq(eventRegistration.id, registrationId))
      const [row] = await (lock ? query.for("share") : query)
      return row
    },
    "event.readRegistrationAnswers",
    async (tx, registration) => {
      const answers = await tx
        .select()
        .from(eventRegistrationAnswer)
        .where(eq(eventRegistrationAnswer.registrationId, registration.id))
      const choices = await tx
        .select()
        .from(eventRegistrationAnswerChoice)
        .where(eq(eventRegistrationAnswerChoice.registrationId, registration.id))
      return { registration, answers, choices }
    },
    database
  )
}

/** One attendance record, visible only to its member, Admin, current manager or an eligible current Section parent. */
export async function getAttendance(attendanceId: string, database: Database = db) {
  if (!z.uuid().safeParse(attendanceId).success) return null
  return readParticipant(
    async (tx, lock) => {
      const query = tx.select().from(eventAttendance).where(eq(eventAttendance.id, attendanceId))
      const [row] = await (lock ? query.for("share") : query)
      return row
    },
    "event.readAttendance",
    async (_tx, row) => row,
    database
  )
}

const attendanceInput = z.object({
  eventId: z.uuid(),
  userId: z.string().min(1),
  status: z.enum(attendanceStatus.enumValues)
})

/**
 * Record or correct attendance for an audience member of a Published Event. Derives recordedBy
 * from fresh authority. Section parents are limited to Rehearsals/Concerts and the subject's
 * Section at the Event start; the editor must hold the Position now.
 */
export async function recordAttendance(input: z.input<typeof attendanceInput>, database: Database = db) {
  const parsed = attendanceInput.parse(input)
  return database.transaction(async (tx) => {
    const access = await forCurrentRequest(tx)
    const context = await participantContext(tx, access, parsed.eventId, parsed.userId)
    const actor = access.requirePermission({
      action: "event.recordAttendance",
      context: { ...context, record: { eventId: parsed.eventId, userId: parsed.userId } }
    })
    const [saved] = await tx
      .insert(eventAttendance)
      .values({
        ...parsed,
        recordedBy: actor.userId,
        recordedAt: context.now
      })
      .onConflictDoUpdate({
        target: [eventAttendance.eventId, eventAttendance.userId],
        set: { status: parsed.status, recordedBy: actor.userId, recordedAt: context.now }
      })
      .returning()
    return saved
  })
}
