import "server-only"

import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, groupMember, positionAppointment, section } from "@/core/db/schema/org-structure"
import { contains, type VoiceDivision } from "@/features/voice/model"
import { requireActiveGroup, requireGroup } from "./lookup"
import { GROUP_POLICIES, type IsoDate, organisationYearPeriod, POSITION_DEFINITIONS, type PositionCode } from "./model"
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
}

/** Adds a dated direct member or Helper. Annual end defaults to 1 July (exclusive).
 * Section placement creates independent Choir participation when missing. Board/Föräldramötet refuse additions.
 */
export function addDirectMembership(database: OrgStructureDatabase, input: MembershipInput) {
  return runOrgStructureCommand(database, async (tx) => {
    await lockUser(tx, input.userId)
    const values = await membershipValues(tx, input)
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
      voice: directMembership.voice
    })
    .from(directMembership)
    .innerJoin(user, eq(user.id, directMembership.userId))
    .where(eq(directMembership.groupId, groupId))
    .orderBy(user.name, directMembership.startDate)
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
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const current = await membershipForEdit(tx, input.membershipId)
    await requireAllowedMembershipTransfer(tx, current.groupId, input.groupId)
    const values = await membershipValues(tx, { ...input, userId: current.userId }, true)
    await tx.update(directMembership).set(values).where(eq(directMembership.id, current.id))
    await validateUserParticipation(tx, current.userId)
    return { id: current.id }
  })
}

/** Ordinary change from an effective date: closes the previous period and opens its successor.
 * Use correctDirectMembership instead when fixing an erroneous historical record.
 */
export function changeDirectMembership(
  database: OrgStructureDatabase,
  input: {
    membershipId: string
    date: IsoDate
    groupId: string
    endDate: IsoDate | null
    voice?: VoiceDivision | null
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const current = await membershipForEdit(tx, input.membershipId)
    const date = requireDate(input.date)
    if (date <= current.startDate || (current.endDate !== null && date >= current.endDate))
      throw new RuleViolation("period-conflict")
    await requireAllowedMembershipTransfer(tx, current.groupId, input.groupId)
    const values = await membershipValues(tx, { ...input, userId: current.userId, startDate: date })
    await tx.update(directMembership).set({ endDate: date }).where(eq(directMembership.id, current.id))
    const [created] = await tx.insert(directMembership).values(values).returning({ id: directMembership.id })
    await validateUserParticipation(tx, current.userId)
    return created as { id: string }
  })
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
    (original.type !== "Section" || target.type !== "Section" || original.choirId !== target.choirId)
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
  if (
    (endDate !== null && endDate <= startDate) ||
    (bounds && (startDate < bounds.startDate || endDate === null || endDate > bounds.endDate))
  )
    throw new RuleViolation("period-conflict")
  const voice = input.voice ?? null
  if (target.type === "Section") {
    const [sung] = await tx.select().from(section).where(eq(section.groupId, target.id))
    if (!voice || !sung || !contains(sung.voice, voice)) throw new RuleViolation("voice-not-sung-in-section")
  } else if (voice !== null) throw new RuleViolation("voice-not-sung-in-section")
  return { userId: input.userId, groupId: input.groupId, startDate, endDate, voice }
}

function covers(rows: Period[], period: Period) {
  let until: IsoDate | null = period.startDate
  for (const row of rows.toSorted((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (row.endDate !== null && row.endDate <= until) continue
    if (row.startDate > until) break
    until = row.endDate
    if (until === null || (period.endDate !== null && until >= period.endDate)) return true
  }
  return false
}

async function ensurePlacementChoir(tx: OrgStructureTransaction, input: typeof directMembership.$inferInsert) {
  const target = await requireGroup(tx, input.groupId)
  if (target.type !== "Section" || !target.choirId) return
  await requireActiveGroup(tx, target.choirId)
  const direct = await tx
    .select()
    .from(directMembership)
    .where(and(eq(directMembership.userId, input.userId), eq(directMembership.groupId, target.choirId)))
  const legacy = await tx
    .select()
    .from(groupMember)
    .where(and(eq(groupMember.userId, input.userId), eq(groupMember.groupId, target.choirId)))
  const period = { startDate: input.startDate, endDate: input.endDate ?? null }
  if (!covers([...direct, ...legacy], period)) {
    if ([...direct, ...legacy].some((row) => overlaps(row, period))) throw new RuleViolation("not-a-choir-member")
    await tx.insert(directMembership).values({ userId: input.userId, groupId: target.choirId, ...period })
  }
}

function overlaps(a: Period, b: Period) {
  return (a.endDate === null || b.startDate < a.endDate) && (b.endDate === null || a.startDate < b.endDate)
}

/** Checks complete dated dependencies under the user's command lock, across the transitional stores. */
export async function validateUserParticipation(tx: OrgStructureTransaction, userId: string) {
  const direct = await tx
    .select({ membership: directMembership, group })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .where(eq(directMembership.userId, userId))
  const legacy = await tx
    .select({ membership: groupMember, group })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(eq(groupMember.userId, userId))
  const appointments = await tx.select().from(positionAppointment).where(eq(positionAppointment.userId, userId))
  const rows = [...direct, ...legacy]
  for (const row of rows) {
    if (
      row.group.choirId &&
      !covers(
        rows.filter((other) => other.group.id === row.group.choirId).map((other) => other.membership),
        row.membership
      )
    )
      throw new RuleViolation("not-a-choir-member")
    if (
      row.group.type === "Section" &&
      rows.some(
        (other) =>
          other.membership !== row.membership &&
          other.group.type === "Section" &&
          other.group.choirId === row.group.choirId &&
          overlaps(other.membership, row.membership)
      )
    )
      throw new RuleViolation("already-in-section")
  }
  for (const appointment of appointments) {
    if (!POSITION_DEFINITIONS[appointment.positionCode as PositionCode].prerequisite) continue
    if (
      !covers(
        rows.filter((row) => row.group.id === appointment.contextGroupId).map((row) => row.membership),
        appointment
      )
    )
      throw new RuleViolation("membership-dependency")
  }
}

/** Corrects a retained legacy period without converting or deleting it. Existing inclusive UI
 * contracts remain untouched; this explicit correction uses the new exclusive-end contract.
 * Annual legacy data needs reconciliation to a concrete year before dates can be edited.
 */
export function correctLegacyMembership(
  database: OrgStructureDatabase,
  input: {
    userId: string
    originalGroupId: string
    originalStartDate: IsoDate
    groupId: string
    startDate: IsoDate
    endDate: IsoDate | null
    voice?: VoiceDivision | null
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    await lockUser(tx, input.userId)
    const key = and(
      eq(groupMember.userId, input.userId),
      eq(groupMember.groupId, input.originalGroupId),
      eq(groupMember.startDate, input.originalStartDate)
    )
    const [current] = await tx.select().from(groupMember).where(key).for("update")
    if (!current) throw new RuleViolation("not-a-member")
    await requireAllowedMembershipTransfer(tx, current.groupId, input.groupId)
    const values = await membershipValues(tx, input, true)
    await tx.update(groupMember).set(values).where(key)
    await validateUserParticipation(tx, input.userId)
    return { userId: input.userId, groupId: input.groupId, startDate: input.startDate }
  })
}
