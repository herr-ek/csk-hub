import "server-only"

import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import {
  appointmentGrant,
  directMembership,
  group,
  groupMember,
  positionAppointment
} from "@/core/db/schema/org-structure"
import { listDirectMembersAt, validateUserParticipation } from "./direct-membership"
import { requireChoirTeamAvailable } from "./group-cardinality"
import { requireActiveGroup, requireChoir } from "./lookup"
import {
  GROUP_POLICIES,
  type GroupType,
  type IsoDate,
  organisationYearPeriod,
  POSITION_DEFINITIONS,
  type PositionCode
} from "./model"
import {
  lockUser,
  type OrgStructureDatabase,
  type OrgStructureTransaction,
  RuleViolation,
  requireDate,
  runOrgStructureCommand
} from "./operation"

async function resolveGrantGroups(
  tx: OrgStructureTransaction,
  definition: (typeof POSITION_DEFINITIONS)[PositionCode],
  context: Awaited<ReturnType<typeof requireActiveGroup>>,
  year: number | undefined
) {
  const ids: string[] = []
  for (const type of definition.grants) {
    if (type === context.type) {
      if (!context.usesAppointmentModel) throw new RuleViolation("position-not-allowed")
      ids.push(context.id)
      continue
    }
    const [target] = await tx
      .select({ id: group.id })
      .from(group)
      .where(
        and(
          eq(group.type, type),
          eq(group.usesAppointmentModel, true),
          eq(group.active, true),
          GROUP_POLICIES[type].lifetime === "annual"
            ? eq(group.organisationYear, year as number)
            : isNull(group.organisationYear)
        )
      )
      .for("share")
    if (!target) throw new RuleViolation("group-not-found")
    ids.push(target.id)
  }
  return ids
}

async function convertHelpers(
  tx: OrgStructureTransaction,
  userId: string,
  grantIds: string[],
  startDate: IsoDate,
  endDate: IsoDate | null
) {
  const targets = await tx.select({ id: group.id, type: group.type }).from(group).where(inArray(group.id, grantIds))
  for (const target of targets.filter(({ type }) => GROUP_POLICIES[type].directMembership === "helpers")) {
    const helpers = await tx
      .select()
      .from(directMembership)
      .where(
        and(
          eq(directMembership.userId, userId),
          eq(directMembership.groupId, target.id),
          lt(directMembership.startDate, endDate ?? "9999-12-31"),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, startDate))
        )
      )
    for (const helper of helpers) {
      if (helper.startDate >= startDate) await tx.delete(directMembership).where(eq(directMembership.id, helper.id))
      else await tx.update(directMembership).set({ endDate: startDate }).where(eq(directMembership.id, helper.id))
    }
  }
}

async function requirePrerequisiteCoverage(
  tx: OrgStructureTransaction,
  userId: string,
  contextGroupId: string,
  startDate: IsoDate,
  endDate: IsoDate | null
) {
  const memberships = [
    ...(await tx
      .select({ startDate: directMembership.startDate, endDate: directMembership.endDate })
      .from(directMembership)
      .where(
        and(
          eq(directMembership.userId, userId),
          eq(directMembership.groupId, contextGroupId),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, startDate)),
          endDate === null ? undefined : lt(directMembership.startDate, endDate)
        )
      )),
    ...(await tx
      .select({ startDate: groupMember.startDate, endDate: groupMember.endDate })
      .from(groupMember)
      .where(
        and(
          eq(groupMember.userId, userId),
          eq(groupMember.groupId, contextGroupId),
          or(isNull(groupMember.endDate), gt(groupMember.endDate, startDate)),
          endDate === null ? undefined : lt(groupMember.startDate, endDate)
        )
      ))
  ].sort((a, b) => a.startDate.localeCompare(b.startDate))
  let coveredUntil: IsoDate | null = startDate
  for (const membership of memberships) {
    if (membership.startDate > coveredUntil) break
    if (membership.endDate === null) {
      coveredUntil = null
      break
    }
    if (membership.endDate > coveredUntil) coveredUntil = membership.endDate
    if (endDate !== null && coveredUntil >= endDate) break
  }
  if (coveredUntil !== null && (endDate === null || coveredUntil < endDate)) throw new RuleViolation("not-a-member")
}

/**
 * Creates an explicitly modelled Group. Annual types require an integer organisationYear
 * from 1000 through 9998; other types forbid it. Choir-scoped types require choirId;
 * CSK-wide types forbid it. Choirs/Sections still use createChoir. Legacy creation and
 * the internal compatibility marker remain until redesign ticket 08.
 */
export function createOrganisationGroup(
  database: OrgStructureDatabase,
  input: {
    name: string
    type: Exclude<GroupType, "Choir" | "Section">
    choirId?: string
    organisationYear?: number
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const policy = GROUP_POLICIES[input.type]
    if (!policy || (input.type as GroupType) === "Choir" || (input.type as GroupType) === "Section")
      throw new RuleViolation("choir-created-with-sections")
    if ((policy.scope === "choir") !== Boolean(input.choirId)) throw new RuleViolation("invalid-group-scope")
    if (!input.name.trim()) throw new RuleViolation("invalid-group-name")
    if (input.choirId) await requireChoir(tx, input.choirId)
    if (
      (policy.lifetime === "annual") !== (input.organisationYear !== undefined) ||
      (input.organisationYear !== undefined &&
        (!Number.isInteger(input.organisationYear) || input.organisationYear < 1000 || input.organisationYear > 9998))
    )
      throw new RuleViolation("period-conflict")
    await requireChoirTeamAvailable(tx, input)
    const [created] = await tx
      .insert(group)
      .values({ ...input, name: input.name.trim(), usesAppointmentModel: true })
      .returning({ id: group.id })
    if (!created) throw new Error("Group creation returned no record.")
    return created
  })
}

/**
 * Records one appointment and resolves its grants from the fixed catalogue in one savepoint.
 * Dates are inclusive/exclusive. Annual Choir appointments need an explicit year; annual
 * Group contexts supply their year. Prerequisite participation must cover the entire tenure.
 * This additive API does not convert legacy holdings or feed legacy live reads (removed in 08).
 */
export function appointPosition(
  database: OrgStructureDatabase,
  input: {
    userId: string
    positionCode: PositionCode
    contextGroupId: string
    organisationYear?: number
    startDate: IsoDate
    endDate?: IsoDate | null
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    await lockUser(tx, input.userId)
    const context = await requireActiveGroup(tx, input.contextGroupId)
    const definition = POSITION_DEFINITIONS[input.positionCode]
    if (!definition || context.type !== definition.context) throw new RuleViolation("position-not-allowed")
    const year = input.organisationYear ?? context.organisationYear
    if (context.organisationYear !== null && year !== context.organisationYear)
      throw new RuleViolation("period-conflict")
    const annual = definition.endPolicy === "annual"
    if (annual && (year == null || !Number.isInteger(year) || year < 1000 || year > 9998))
      throw new RuleViolation("period-conflict")
    if (!annual && year != null) throw new RuleViolation("period-conflict")
    const bounds = annual ? organisationYearPeriod(year as number) : undefined
    const startDate = requireDate(input.startDate)
    const endDate = input.endDate === undefined ? (bounds?.endDate ?? null) : input.endDate
    if (endDate !== null) requireDate(endDate)
    if (
      (endDate !== null && endDate <= startDate) ||
      (bounds && (startDate < bounds.startDate || endDate === null || endDate > bounds.endDate))
    )
      throw new RuleViolation("period-conflict")
    if (definition.prerequisite) await requirePrerequisiteCoverage(tx, input.userId, context.id, startDate, endDate)

    const grantIds = await resolveGrantGroups(tx, definition, context, year ?? undefined)
    const [created] = await tx
      .insert(positionAppointment)
      .values({
        userId: input.userId,
        positionCode: input.positionCode,
        contextGroupId: context.id,
        organisationYear: annual ? year : null,
        startDate,
        endDate
      })
      .returning({ id: positionAppointment.id })
    if (!created) throw new Error("Appointment creation returned no record.")
    if (grantIds.length)
      await tx.insert(appointmentGrant).values(grantIds.map((groupId) => ({ appointmentId: created.id, groupId })))
    // Helper membership is a separate, voluntary record. Convert only overlapping direct
    // membership in helper-enabled companion groups; preserve the earlier period.
    await convertHelpers(tx, input.userId, grantIds, startDate, endDate)
    return created
  })
}

/** Ends one appointment and all of its grants on an exclusive calendar-date boundary. */
export function endAppointment(database: OrgStructureDatabase, input: { appointmentId: string; endDate: IsoDate }) {
  return runOrgStructureCommand(database, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:appointment:${input.appointmentId}`}))`)
    const [appointment] = await tx
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, input.appointmentId))
    if (!appointment) throw new RuleViolation("not-holding-position")
    await lockUser(tx, appointment.userId)
    const endDate = requireDate(input.endDate)
    if (endDate <= appointment.startDate || (appointment.endDate !== null && endDate > appointment.endDate))
      throw new RuleViolation("period-conflict")
    await tx.update(positionAppointment).set({ endDate }).where(eq(positionAppointment.id, appointment.id))
    return { id: appointment.id }
  })
}

/** Replaces the holder for one Position/context at an exact boundary, closing every old grant together. */
export function replaceAppointmentHolder(
  database: OrgStructureDatabase,
  input: {
    userId: string
    positionCode: PositionCode
    contextGroupId: string
    organisationYear?: number
    startDate: IsoDate
    endDate?: IsoDate
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    const [candidate] = await tx
      .select()
      .from(positionAppointment)
      .where(
        and(
          eq(positionAppointment.contextGroupId, input.contextGroupId),
          eq(positionAppointment.positionCode, input.positionCode),
          lte(positionAppointment.startDate, startDate),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, startDate))
        )
      )
    for (const userId of [
      ...new Set([input.userId, candidate?.userId].filter((id): id is string => Boolean(id)))
    ].sort())
      await lockUser(tx, userId)
    const [predecessor] = await tx
      .select()
      .from(positionAppointment)
      .where(
        and(
          eq(positionAppointment.contextGroupId, input.contextGroupId),
          eq(positionAppointment.positionCode, input.positionCode),
          lte(positionAppointment.startDate, startDate),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, startDate))
        )
      )
      .for("update")
    if (predecessor) {
      if (predecessor.startDate === startDate) throw new RuleViolation("period-conflict")
      await tx.update(positionAppointment).set({ endDate: startDate }).where(eq(positionAppointment.id, predecessor.id))
    }
    const result = await appointPosition(tx, input)
    if (!result.success) throw new RuleViolation(result.error)
    return result.data
  })
}

/** Cancels a prepared future appointment without rewriting started history. */
export function cancelPreparedAppointment(
  database: OrgStructureDatabase,
  input: { appointmentId: string; today: IsoDate }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const today = requireDate(input.today)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:appointment:${input.appointmentId}`}))`)
    const [appointment] = await tx
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, input.appointmentId))
    if (!appointment) throw new RuleViolation("not-holding-position")
    await lockUser(tx, appointment.userId)
    if (appointment.startDate <= today) throw new RuleViolation("period-conflict")
    await tx.delete(positionAppointment).where(eq(positionAppointment.id, appointment.id))
    return { id: appointment.id }
  })
}

/** Corrects an existing annual appointment and re-resolves every granted Group atomically. */
export function correctAnnualAppointment(
  database: OrgStructureDatabase,
  input: {
    appointmentId: string
    userId: string
    positionCode: PositionCode
    contextGroupId: string
    organisationYear: number
    startDate: IsoDate
    endDate: IsoDate
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:appointment:${input.appointmentId}`}))`)
    const [existing] = await tx
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, input.appointmentId))
    if (!existing) throw new RuleViolation("not-holding-position")
    for (const userId of [...new Set([existing.userId, input.userId])].sort()) await lockUser(tx, userId)
    const definition = POSITION_DEFINITIONS[input.positionCode]
    if (!definition) throw new RuleViolation("position-not-allowed")
    const context = await requireActiveGroup(tx, input.contextGroupId)
    if (definition.endPolicy !== "annual" || context.type !== definition.context)
      throw new RuleViolation("position-not-allowed")
    const choirScopedAnnual = context.type === "Choir" && definition.prerequisite
    if (!choirScopedAnnual && context.organisationYear !== input.organisationYear)
      throw new RuleViolation("period-conflict")
    const bounds = organisationYearPeriod(input.organisationYear)
    const startDate = requireDate(input.startDate)
    const endDate = requireDate(input.endDate)
    if (startDate < bounds.startDate || endDate > bounds.endDate || endDate <= startDate)
      throw new RuleViolation("period-conflict")
    if (definition.prerequisite) await requirePrerequisiteCoverage(tx, input.userId, context.id, startDate, endDate)
    const grantIds = await resolveGrantGroups(tx, definition, context, input.organisationYear)
    await tx
      .update(positionAppointment)
      .set({
        userId: input.userId,
        positionCode: input.positionCode,
        contextGroupId: context.id,
        organisationYear: input.organisationYear,
        startDate,
        endDate
      })
      .where(eq(positionAppointment.id, existing.id))
    await tx.delete(appointmentGrant).where(eq(appointmentGrant.appointmentId, existing.id))
    if (grantIds.length)
      await tx.insert(appointmentGrant).values(grantIds.map((groupId) => ({ appointmentId: existing.id, groupId })))
    await convertHelpers(tx, input.userId, grantIds, startDate, endDate)
    return { id: existing.id }
  })
}

/** Corrects a fluid Position appointment and re-resolves its grants atomically. */
export function correctFluidAppointment(
  database: OrgStructureDatabase,
  input: {
    appointmentId: string
    userId: string
    positionCode: PositionCode
    contextGroupId: string
    startDate: IsoDate
    endDate: IsoDate | null
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:appointment:${input.appointmentId}`}))`)
    const [existing] = await tx
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, input.appointmentId))
    if (!existing) throw new RuleViolation("not-holding-position")
    for (const userId of [...new Set([existing.userId, input.userId])].sort()) await lockUser(tx, userId)
    const definition = POSITION_DEFINITIONS[input.positionCode]
    if (definition?.endPolicy !== "fluid") throw new RuleViolation("position-not-allowed")
    const context = await requireActiveGroup(tx, input.contextGroupId)
    if (context.type !== definition.context) throw new RuleViolation("position-not-allowed")
    const startDate = requireDate(input.startDate)
    const endDate = input.endDate === null ? null : requireDate(input.endDate)
    if (endDate !== null && endDate <= startDate) throw new RuleViolation("period-conflict")
    const grantIds = await resolveGrantGroups(tx, definition, context, undefined)
    await tx
      .update(positionAppointment)
      .set({
        userId: input.userId,
        positionCode: input.positionCode,
        contextGroupId: context.id,
        organisationYear: null,
        startDate,
        endDate
      })
      .where(eq(positionAppointment.id, existing.id))
    await tx.delete(appointmentGrant).where(eq(appointmentGrant.appointmentId, existing.id))
    if (grantIds.length)
      await tx.insert(appointmentGrant).values(grantIds.map((groupId) => ({ appointmentId: existing.id, groupId })))
    await validateUserParticipation(tx, input.userId)
    return { id: existing.id }
  })
}

/** Dated appointment participation only; legacy live rosters are deliberately unchanged until cutover. */
export async function listAppointmentMembersAt(database: OrgStructureDatabase, groupId: string, date: IsoDate) {
  requireDate(date)
  const rows = await database
    .select({ appointment: positionAppointment })
    .from(appointmentGrant)
    .innerJoin(positionAppointment, eq(appointmentGrant.appointmentId, positionAppointment.id))
    .where(
      and(
        eq(appointmentGrant.groupId, groupId),
        lte(positionAppointment.startDate, date),
        or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
      )
    )
    .orderBy(positionAppointment.userId, positionAppointment.positionCode, positionAppointment.id)
  const members = new Map<string, { userId: string; appointments: (typeof positionAppointment.$inferSelect)[] }>()
  for (const { appointment } of rows) {
    const member = members.get(appointment.userId) ?? { userId: appointment.userId, appointments: [] }
    member.appointments.push(appointment)
    members.set(appointment.userId, member)
  }
  return [...members.values()]
}

/** Current or dated effective roster, deduplicating direct Members and appointment grants. */
export async function listEffectiveMembersAt(database: OrgStructureDatabase, groupId: string, date: IsoDate) {
  const contextGroup = alias(group, "appointment_context")
  const [direct, grants] = await Promise.all([
    listDirectMembersAt(database, groupId, date),
    database
      .select({
        appointment: positionAppointment,
        name: user.name,
        email: user.email,
        contextName: contextGroup.name
      })
      .from(appointmentGrant)
      .innerJoin(positionAppointment, eq(appointmentGrant.appointmentId, positionAppointment.id))
      .innerJoin(user, eq(user.id, positionAppointment.userId))
      .innerJoin(contextGroup, eq(contextGroup.id, positionAppointment.contextGroupId))
      .where(
        and(
          eq(appointmentGrant.groupId, groupId),
          lte(positionAppointment.startDate, date),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
        )
      )
      .orderBy(asc(contextGroup.name), asc(positionAppointment.positionCode))
  ])
  const members = new Map<
    string,
    {
      userId: string
      name: string
      email: string
      voice: string | null
      positions: { id: string; positionCode: PositionCode; contextGroupId: string; contextName: string }[]
    }
  >()
  for (const member of direct) {
    members.set(member.userId, {
      userId: member.userId,
      name: member.name,
      email: member.email,
      voice: member.voice,
      positions: []
    })
  }
  for (const { appointment, name, email, contextName } of grants) {
    const member = members.get(appointment.userId) ?? {
      userId: appointment.userId,
      name,
      email,
      voice: null,
      positions: []
    }
    member.positions.push({
      id: appointment.id,
      positionCode: appointment.positionCode as PositionCode,
      contextGroupId: appointment.contextGroupId,
      contextName
    })
    members.set(appointment.userId, member)
  }
  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"))
}

/** Lists every appointment attached to a Group as its context or a granted Membership. */
export async function listAppointmentsForGroup(database: OrgStructureDatabase, groupId: string) {
  const contextGroup = alias(group, "appointment_context")
  const rows = await database
    .selectDistinct({ appointment: positionAppointment, name: user.name, contextName: contextGroup.name })
    .from(positionAppointment)
    .leftJoin(appointmentGrant, eq(appointmentGrant.appointmentId, positionAppointment.id))
    .innerJoin(user, eq(user.id, positionAppointment.userId))
    .innerJoin(contextGroup, eq(contextGroup.id, positionAppointment.contextGroupId))
    .where(or(eq(appointmentGrant.groupId, groupId), eq(positionAppointment.contextGroupId, groupId)))
    .orderBy(desc(positionAppointment.startDate))
  return rows.map(({ appointment, name, contextName }) => ({
    id: appointment.id,
    userId: appointment.userId,
    name,
    positionCode: appointment.positionCode as PositionCode,
    position: POSITION_DEFINITIONS[appointment.positionCode as PositionCode]?.label ?? appointment.positionCode,
    contextGroupId: appointment.contextGroupId,
    contextName,
    startDate: appointment.startDate as IsoDate,
    endDate: appointment.endDate as IsoDate | null,
    organisationYear: appointment.organisationYear
  }))
}
