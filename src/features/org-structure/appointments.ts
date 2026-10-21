import "server-only"

import { and, eq, gt, isNull, lt, lte, or } from "drizzle-orm"
import { appointmentGrant, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
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
import { lockUser, type OrgStructureDatabase, RuleViolation, requireDate, runOrgStructureCommand } from "./operation"

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
    if (definition.prerequisite) {
      const memberships = await tx
        .select({ startDate: directMembership.startDate, endDate: directMembership.endDate })
        .from(directMembership)
        .where(
          and(
            eq(directMembership.userId, input.userId),
            eq(directMembership.groupId, context.id),
            or(isNull(directMembership.endDate), gt(directMembership.endDate, startDate)),
            endDate === null ? undefined : lt(directMembership.startDate, endDate)
          )
        )
        .orderBy(directMembership.startDate)
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

    const grantIds: string[] = []
    for (const type of definition.grants) {
      if (type === context.type) {
        if (!context.usesAppointmentModel) throw new RuleViolation("position-not-allowed")
        grantIds.push(context.id)
      } else {
        const [target] = await tx
          .select()
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
        grantIds.push(target.id)
      }
    }
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
    return created
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
