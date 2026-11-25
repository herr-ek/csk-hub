import "server-only"

import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { voiceCapability } from "@/core/db/schema/voice"
import {
  GROUP_POLICIES,
  GroupType,
  type IsoDate,
  organisationYearPeriod,
  POSITION_DEFINITIONS,
  type PositionCode,
  periodsCoverPeriod,
  sectionName
} from "@/core/org-structure"
import { contains, divisionsOf, isVoiceDivision, type VoiceDivision, type VoiceFamily } from "@/features/voice/model"
import { appointmentMemberships } from "./appointment-memberships"
import { cskToday } from "./effective-reads"
import { requireActiveGroup, requireGroup } from "./lookup"
import {
  lockUser,
  type OrgStructureDatabase,
  type OrgStructureTransaction,
  RuleViolation,
  requireDate,
  runOrgStructureCommand
} from "./operation"

type Period = { startDate: IsoDate; endDate: IsoDate | null }
type MembershipInput = {
  userId: string
  groupId: string
  startDate: IsoDate
  endDate?: IsoDate | null
  voice?: VoiceDivision | null
  voiceFamily?: VoiceFamily | null
}

/** Adds a dated direct member or Helper. Annual end defaults to 1 July (exclusive).
 * Sections and gig groups require a Voice division and Rekryteringskommittén a Voice family; other Groups
 * forbid both. Gig groups and Rekryteringskommittén also require that the User can sing it: a matching
 * capability, or a matching Section Voice on the start date. That is never checked again afterwards.
 * Section placement creates independent Choir participation when missing. Board/Föräldramötet refuse additions.
 */
export function addDirectMembership(database: OrgStructureDatabase, input: MembershipInput) {
  return runOrgStructureCommand(database, async (tx) => {
    await lockUser(tx, input.userId)
    const values = await membershipValues(tx, input)
    await requireSungVoice(tx, values)
    await ensurePlacementChoir(tx, values)
    const [created] = await tx.insert(directMembership).values(values).returning({ id: directMembership.id })
    await validateUserParticipation(tx, input.userId)
    return created as { id: string }
  })
}

/** All explicitly stored periods, including future/history, with stable correction identities. */
export async function listDirectMemberships(database: OrgStructureDatabase, groupId: string) {
  return database
    .select({
      id: directMembership.id,
      userId: directMembership.userId,
      groupId: directMembership.groupId,
      name: user.name,
      email: user.email,
      startDate: directMembership.startDate,
      endDate: directMembership.endDate,
      voice: directMembership.voice,
      voiceFamily: directMembership.voiceFamily
    })
    .from(directMembership)
    .innerJoin(user, eq(user.id, directMembership.userId))
    .where(eq(directMembership.groupId, groupId))
    .orderBy(user.name, directMembership.startDate)
}

/** Every direct Membership for one User, for Admin correction history. */
export async function listDirectMembershipsOfUser(database: OrgStructureDatabase, userId: string) {
  const owningChoir = alias(group, "direct_membership_choir")
  const rows = await database
    .select({
      id: directMembership.id,
      groupId: group.id,
      groupName: group.name,
      groupType: group.type,
      choirName: owningChoir.name,
      sectionVoice: section.voice,
      startDate: directMembership.startDate,
      endDate: directMembership.endDate,
      voice: directMembership.voice
    })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .leftJoin(section, eq(section.groupId, group.id))
    .leftJoin(owningChoir, eq(owningChoir.id, group.choirId))
    .where(eq(directMembership.userId, userId))
    .orderBy(desc(directMembership.startDate))
  return rows.map(({ groupType, choirName, sectionVoice, ...row }) => ({
    ...row,
    groupName: groupType === GroupType.Section ? sectionName(choirName, sectionVoice) : row.groupName
  }))
}

/** Direct participation at an inclusive calendar date; never interprets a null end as current by itself. */
export async function listDirectMembersAt(database: OrgStructureDatabase, groupId: string, date: IsoDate) {
  requireDate(date)
  return (await listDirectMemberships(database, groupId)).filter(
    (row) => row.startDate <= date && (row.endDate === null || date < row.endDate)
  )
}

/** Explicit correction of mistaken dates/placement, retaining the record's identity.
 * Refuses any correction that strands an appointment, Choir-scoped member, or singer placement.
 */
export function correctDirectMembership(
  database: OrgStructureDatabase,
  input: {
    membershipId: string
    groupId: string
    startDate: IsoDate
    endDate: IsoDate | null
    voice?: VoiceDivision | null
    voiceFamily?: VoiceFamily | null
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const current = await membershipForEdit(tx, input.membershipId)
    await requireAllowedMembershipTransfer(tx, current.groupId, input.groupId)
    const values = await membershipValues(tx, { ...input, userId: current.userId }, true)
    if (values.voice !== current.voice || values.voiceFamily !== current.voiceFamily) await requireSungVoice(tx, values)
    await tx.update(directMembership).set(values).where(eq(directMembership.id, current.id))
    await validateUserParticipation(tx, current.userId)
    return { id: current.id }
  })
}

/** Voice-only edits in a gig group retain the membership identity and dates.
 * Other changes close the previous period at `date` and open its successor. A change on the day a
 * period starts corrects it in place, as long as that day is not in the past.
 * Use correctDirectMembership instead when fixing an erroneous historical record.
 * With `endAppointments`, appointments that lose their prerequisite end on `date` instead of
 * refusing the change.
 */
export function changeDirectMembership(
  database: OrgStructureDatabase,
  input: {
    membershipId: string
    date: IsoDate
    groupId: string
    endDate: IsoDate | null
    voice?: VoiceDivision | null
    endAppointments?: boolean
  },
  today: IsoDate = cskToday()
) {
  return runOrgStructureCommand(database, async (tx) => {
    const current = await membershipForEdit(tx, input.membershipId)
    const date = requireDate(input.date)
    const editsGigVoice =
      input.groupId === current.groupId &&
      input.endDate === current.endDate &&
      (await requireGroup(tx, current.groupId)).type === GroupType.GigGroup
    if (editsGigVoice) {
      const values = await membershipValues(tx, {
        userId: current.userId,
        groupId: current.groupId,
        startDate: current.startDate,
        endDate: current.endDate,
        voice: input.voice
      })
      if (values.voice !== current.voice) await requireSungVoice(tx, values)
      await tx.update(directMembership).set({ voice: values.voice }).where(eq(directMembership.id, current.id))
      return { id: current.id }
    }
    const corrects = date === current.startDate && date >= today
    if ((!corrects && date <= current.startDate) || (current.endDate !== null && date >= current.endDate))
      throw new RuleViolation("period-conflict")
    await requireAllowedMembershipTransfer(tx, current.groupId, input.groupId)
    const values = await membershipValues(tx, { ...input, userId: current.userId, startDate: date })
    if (corrects) {
      await tx.update(directMembership).set(values).where(eq(directMembership.id, current.id))
      if (input.endAppointments) await endUncoveredAppointments(tx, current.userId, date, today)
      await validateUserParticipation(tx, current.userId)
      return { id: current.id }
    }
    await tx.update(directMembership).set({ endDate: date }).where(eq(directMembership.id, current.id))
    const [created] = await tx.insert(directMembership).values(values).returning({ id: directMembership.id })
    if (input.endAppointments) await endUncoveredAppointments(tx, current.userId, date, today)
    await validateUserParticipation(tx, current.userId)
    return created as { id: string }
  })
}

/** Removes someone from a Group from `date`, the first day they are no longer a member. Participation
 * that has not begun, or began today, is deleted rather than kept as a record of a day. Appointments
 * that lose their prerequisite end with `endAppointments`; without it they refuse the removal.
 */
export function removeDirectMembership(
  database: OrgStructureDatabase,
  input: { membershipId: string; date: IsoDate; endAppointments?: boolean },
  today: IsoDate = cskToday()
) {
  return runOrgStructureCommand(database, async (tx) => {
    const current = await membershipForEdit(tx, input.membershipId)
    const date = requireDate(input.date)
    if (current.startDate >= today) await tx.delete(directMembership).where(eq(directMembership.id, current.id))
    else {
      if (date <= current.startDate || (current.endDate !== null && date > current.endDate))
        throw new RuleViolation("period-conflict")
      await tx.update(directMembership).set({ endDate: date }).where(eq(directMembership.id, current.id))
    }
    if (input.endAppointments) await endUncoveredAppointments(tx, current.userId, date < today ? today : date, today)
    await validateUserParticipation(tx, current.userId)
    return { id: current.id }
  })
}

/** Ends, on `date`, each appointment whose prerequisite Membership no longer covers it. One that would
 * not have begun is removed. Appointments already over are left for validation to judge.
 */
export async function endUncoveredAppointments(
  tx: OrgStructureTransaction,
  userId: string,
  date: IsoDate,
  today: IsoDate
) {
  const appointments = await tx
    .select()
    .from(positionAppointment)
    .where(
      and(
        eq(positionAppointment.userId, userId),
        or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
      )
    )
  for (const appointment of appointments) {
    if (!POSITION_DEFINITIONS[appointment.positionCode].prerequisite) continue
    const periods = await tx
      .select({ startDate: directMembership.startDate, endDate: directMembership.endDate })
      .from(directMembership)
      .where(and(eq(directMembership.userId, userId), eq(directMembership.groupId, appointment.contextGroupId)))
    if (periodsCoverPeriod(periods, appointment)) continue
    if (appointment.startDate < date)
      await tx.update(positionAppointment).set({ endDate: date }).where(eq(positionAppointment.id, appointment.id))
    else if (appointment.startDate >= today)
      await tx.delete(positionAppointment).where(eq(positionAppointment.id, appointment.id))
  }
}

/** Refuses a gig Voice or recruitment Voice the User neither declares nor sings in a Section. */
async function requireSungVoice(tx: OrgStructureTransaction, input: typeof directMembership.$inferInsert) {
  const target = await requireGroup(tx, input.groupId)
  if (target.type !== GroupType.GigGroup && target.type !== GroupType.RecruitmentCommittee) return
  const accepted = input.voiceFamily ? divisionsOf(input.voiceFamily) : input.voice ? [input.voice] : []
  const [capability] = await tx
    .select({ voice: voiceCapability.voice })
    .from(voiceCapability)
    .where(and(eq(voiceCapability.userId, input.userId), inArray(sql`${voiceCapability.voice}::voice`, accepted)))
    .limit(1)
  if (capability) return
  const [sung] = await tx
    .select({ id: directMembership.id })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .where(
      and(
        eq(directMembership.userId, input.userId),
        eq(group.type, GroupType.Section),
        inArray(sql`${directMembership.voice}::voice`, accepted),
        lte(directMembership.startDate, input.startDate),
        or(isNull(directMembership.endDate), gt(directMembership.endDate, input.startDate))
      )
    )
    .limit(1)
  if (!sung) throw new RuleViolation("voice-not-sung-by-member")
}

/** Ends a selected period at an exclusive boundary, including a prepared future or historical period. */
export function endDirectMembership(database: OrgStructureDatabase, input: { membershipId: string; endDate: IsoDate }) {
  return runOrgStructureCommand(database, async (tx) => {
    const current = await membershipForEdit(tx, input.membershipId)
    const endDate = requireDate(input.endDate)
    if (endDate <= current.startDate || (current.endDate !== null && endDate > current.endDate))
      throw new RuleViolation("period-conflict")
    await tx.update(directMembership).set({ endDate }).where(eq(directMembership.id, current.id))
    await validateUserParticipation(tx, current.userId)
    return { id: current.id }
  })
}

async function membershipForEdit(tx: OrgStructureTransaction, id: string) {
  const [initial] = await tx.select().from(directMembership).where(eq(directMembership.id, id))
  if (!initial) throw new RuleViolation("not-a-member")
  await lockUser(tx, initial.userId)
  const [current] = await tx.select().from(directMembership).where(eq(directMembership.id, id)).for("update")
  if (!current) throw new RuleViolation("not-a-member")
  return current
}

async function requireAllowedMembershipTransfer(
  tx: OrgStructureTransaction,
  originalGroupId: string,
  targetGroupId: string
) {
  const original = await requireGroup(tx, originalGroupId)
  const target = await requireGroup(tx, targetGroupId)
  if (
    originalGroupId !== targetGroupId &&
    (original.type !== GroupType.Section || target.type !== GroupType.Section || original.choirId !== target.choirId)
  )
    throw new RuleViolation("section-requires-placement")
}

async function membershipValues(tx: OrgStructureTransaction, input: MembershipInput, correction = false) {
  const target = correction ? await requireGroup(tx, input.groupId) : await requireActiveGroup(tx, input.groupId)
  const policy = GROUP_POLICIES[target.type]
  if (policy.directMembership === "no") throw new RuleViolation("direct-membership-forbidden")
  const startDate = requireDate(input.startDate)
  const bounds = target.organisationYear === null ? null : organisationYearPeriod(target.organisationYear)
  if (policy.lifetime === "annual" && !bounds) throw new RuleViolation("annual-group-needs-year")
  const endDate = input.endDate === undefined ? (bounds?.endDate ?? null) : input.endDate
  if (endDate !== null) requireDate(endDate)
  if (!target.active && (endDate === null || endDate > cskToday())) throw new RuleViolation("group-archived")
  if (
    (endDate !== null && endDate <= startDate) ||
    (bounds && (startDate < bounds.startDate || endDate === null || endDate > bounds.endDate))
  )
    throw new RuleViolation("period-conflict")
  const voice = input.voice ?? null
  if (target.type === GroupType.Section) {
    const [sung] = await tx.select().from(section).where(eq(section.groupId, target.id))
    if (!voice || !sung || !contains(sung.voice, voice)) throw new RuleViolation("voice-not-sung-in-section")
  } else if (target.type === GroupType.GigGroup) {
    if (!isVoiceDivision(voice)) throw new RuleViolation("invalid-membership-voice")
  } else if (voice !== null) throw new RuleViolation("invalid-membership-voice")
  const voiceFamily = input.voiceFamily ?? null
  if ((target.type === GroupType.RecruitmentCommittee) !== (voiceFamily !== null))
    throw new RuleViolation("invalid-membership-voice")
  return { userId: input.userId, groupId: input.groupId, startDate, endDate, voice, voiceFamily }
}

async function ensurePlacementChoir(tx: OrgStructureTransaction, input: typeof directMembership.$inferInsert) {
  const target = await requireGroup(tx, input.groupId)
  if (target.type !== GroupType.Section || !target.choirId) return
  await requireActiveGroup(tx, target.choirId)
  const direct = await tx
    .select()
    .from(directMembership)
    .where(and(eq(directMembership.userId, input.userId), eq(directMembership.groupId, target.choirId)))
  const period = { startDate: input.startDate, endDate: input.endDate ?? null }
  if (!periodsCoverPeriod(direct, period)) {
    if (direct.some((row) => overlaps(row, period))) throw new RuleViolation("not-a-choir-member")
    await tx.insert(directMembership).values({ userId: input.userId, groupId: target.choirId, ...period })
  }
}

function overlaps(a: Period, b: Period) {
  return (a.endDate === null || b.startDate < a.endDate) && (b.endDate === null || a.startDate < b.endDate)
}

/** Checks complete dated dependencies under the user's command lock. */
export async function validateUserParticipation(tx: OrgStructureTransaction, userId: string) {
  const direct = await tx
    .select({ membership: directMembership, group })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .where(eq(directMembership.userId, userId))
  const appointments = await tx.select().from(positionAppointment).where(eq(positionAppointment.userId, userId))
  const derivedMembership = appointmentMemberships(tx)
  const grants = await tx
    .select({ groupId: derivedMembership.groupId, appointment: positionAppointment })
    .from(derivedMembership)
    .innerJoin(positionAppointment, eq(positionAppointment.id, derivedMembership.appointmentId))
    .where(eq(positionAppointment.userId, userId))
  const rows = direct
  for (const row of rows) {
    if (
      GROUP_POLICIES[row.group.type].directMembership === "helpers" &&
      grants.some((grant) => grant.groupId === row.group.id && overlaps(grant.appointment, row.membership))
    )
      throw new RuleViolation("already-holding-position")
    if (
      row.group.choirId &&
      !periodsCoverPeriod(
        rows.filter((other) => other.group.id === row.group.choirId).map((other) => other.membership),
        row.membership
      )
    )
      throw new RuleViolation("not-a-choir-member")
    if (
      row.group.type === GroupType.Section &&
      rows.some(
        (other) =>
          other.membership !== row.membership &&
          other.group.type === GroupType.Section &&
          other.group.choirId === row.group.choirId &&
          overlaps(other.membership, row.membership)
      )
    )
      throw new RuleViolation("already-in-section")
  }
  for (const appointment of appointments) {
    if (!POSITION_DEFINITIONS[appointment.positionCode as PositionCode].prerequisite) continue
    if (
      !periodsCoverPeriod(
        rows.filter((row) => row.group.id === appointment.contextGroupId).map((row) => row.membership),
        appointment
      )
    )
      throw new RuleViolation("membership-dependency")
  }
}
