import "server-only"

import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { appointmentGrant, directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { timeZone } from "@/core/i18n/time-zone"
import {
  type EffectiveGroup,
  type EffectivePosition,
  GroupType,
  type IsoDate,
  POSITION_DEFINITIONS,
  type PositionCode
} from "@/core/org-structure"
import type { Voice } from "@/features/voice/model"
import type { OrgStructureDatabase } from "./operation"
import { requireDate } from "./operation"

export function cskToday(): IsoDate {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date()) as IsoDate
}

/** One interpretation of a person's direct and appointment-granted participation on a date. */
export async function listEffectiveParticipationOfUserAt(
  database: OrgStructureDatabase,
  userId: string,
  date: IsoDate
) {
  requireDate(date)
  const owningChoir = alias(group, "effective_owning_choir")
  const contextGroup = alias(group, "effective_appointment_context")
  const [directRows, grantRows, appointmentRows] = await Promise.all([
    database
      .select({ membership: directMembership, group, sectionVoice: section.voice, choirName: owningChoir.name })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .leftJoin(section, eq(section.groupId, group.id))
      .leftJoin(owningChoir, eq(owningChoir.id, group.choirId))
      .where(
        and(
          eq(directMembership.userId, userId),
          lte(directMembership.startDate, date),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
        )
      ),
    database
      .select({ appointment: positionAppointment, group, context: contextGroup })
      .from(appointmentGrant)
      .innerJoin(positionAppointment, eq(positionAppointment.id, appointmentGrant.appointmentId))
      .innerJoin(group, eq(group.id, appointmentGrant.groupId))
      .innerJoin(contextGroup, eq(contextGroup.id, positionAppointment.contextGroupId))
      .where(
        and(
          eq(positionAppointment.userId, userId),
          lte(positionAppointment.startDate, date),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
        )
      ),
    database
      .select({ appointment: positionAppointment, context: contextGroup, choirName: owningChoir.name })
      .from(positionAppointment)
      .innerJoin(contextGroup, eq(contextGroup.id, positionAppointment.contextGroupId))
      .leftJoin(owningChoir, eq(owningChoir.id, contextGroup.choirId))
      .where(
        and(
          eq(positionAppointment.userId, userId),
          lte(positionAppointment.startDate, date),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
        )
      )
  ])

  type Period = EffectiveGroup["membershipPeriods"][number]
  const groups = new Map<string, EffectiveGroup>()
  function addGroup(
    row: typeof group.$inferSelect,
    period: Period,
    sectionVoice: Voice | null,
    choirName: string | null
  ) {
    const current = groups.get(row.id)
    if (current) {
      current.membershipPeriods.push(period)
      if (period.startDate < current.startDate) current.startDate = period.startDate
      return current
    }
    const created: EffectiveGroup = {
      groupId: row.id,
      name: row.name,
      type: row.type as GroupType,
      choirId: row.choirId,
      choirName,
      active: row.active,
      organisationYear: row.organisationYear,
      startDate: period.startDate,
      endDate: period.endDate,
      voice: period.voice,
      sectionVoice,
      membershipPeriods: [period],
      positions: []
    }
    groups.set(row.id, created)
    return created
  }
  for (const row of directRows)
    addGroup(
      row.group,
      {
        id: row.membership.id,
        source: "direct",
        startDate: row.membership.startDate as IsoDate,
        endDate: row.membership.endDate as IsoDate | null,
        voice: row.membership.voice
      },
      row.sectionVoice,
      row.choirName
    )
  for (const row of grantRows)
    addGroup(
      row.group,
      {
        id: row.appointment.id,
        source: "appointment",
        startDate: row.appointment.startDate as IsoDate,
        endDate: row.appointment.endDate as IsoDate | null,
        voice: null
      },
      null,
      null
    )

  const positionsById = new Map<string, EffectivePosition>()
  const grantsByAppointment = new Map<string, EffectivePosition["grantedGroups"]>()
  for (const row of grantRows) {
    const grants = grantsByAppointment.get(row.appointment.id) ?? []
    if (!grants.some((grant) => grant.id === row.group.id))
      grants.push({
        id: row.group.id,
        name: row.group.name,
        type: row.group.type as GroupType,
        choirId: row.group.choirId,
        organisationYear: row.group.organisationYear
      })
    grantsByAppointment.set(row.appointment.id, grants)
  }
  for (const row of appointmentRows) {
    const code = row.appointment.positionCode as PositionCode
    positionsById.set(row.appointment.id, {
      id: row.appointment.id,
      positionCode: code,
      name: POSITION_DEFINITIONS[code]?.label ?? code,
      contextGroupId: row.context.id,
      contextName: row.context.name,
      contextType: row.context.type as GroupType,
      contextChoirId: row.context.choirId,
      contextChoirName: row.choirName,
      organisationYear: row.appointment.organisationYear,
      startDate: row.appointment.startDate as IsoDate,
      endDate: row.appointment.endDate as IsoDate | null,
      grantedGroups: grantsByAppointment.get(row.appointment.id) ?? [],
      affiliationGroups: []
    })
  }
  const positions = [...positionsById.values()]
  for (const appointment of positions) {
    const visibleIds = new Set(appointment.grantedGroups.map(({ id }) => id))
    if (groups.has(appointment.contextGroupId)) visibleIds.add(appointment.contextGroupId)
    appointment.affiliationGroups = [...visibleIds].flatMap((id) => {
      const row = groups.get(id)
      return row ? [{ id, name: row.name, choirName: row.choirName, type: row.type, choirId: row.choirId }] : []
    })
    for (const granted of appointment.grantedGroups) {
      const row = groups.get(granted.id)
      if (row && !row.positions.some((position) => position.id === appointment.id)) row.positions.push(appointment)
    }
    const contextMembership = groups.get(appointment.contextGroupId)
    if (contextMembership && !contextMembership.positions.some((position) => position.id === appointment.id))
      contextMembership.positions.push(appointment)
  }
  return { groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "sv")), positions }
}

/** Batched current Choir/Section summary using direct placement and appointment grants. */
export async function listEffectiveChoirAffiliationsOfUsersAt(
  database: OrgStructureDatabase,
  userIds: string[],
  date: IsoDate
) {
  requireDate(date)
  if (!userIds.length) return []
  const [direct, grants] = await Promise.all([
    database
      .select({
        userId: directMembership.userId,
        groupId: group.id,
        name: group.name,
        type: group.type,
        choirId: group.choirId
      })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .where(
        and(
          inArray(directMembership.userId, userIds),
          inArray(group.type, [GroupType.Choir, GroupType.Section]),
          eq(group.active, true),
          lte(directMembership.startDate, date),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
        )
      ),
    database
      .select({
        userId: positionAppointment.userId,
        groupId: group.id,
        name: group.name,
        type: group.type,
        choirId: group.choirId
      })
      .from(appointmentGrant)
      .innerJoin(positionAppointment, eq(positionAppointment.id, appointmentGrant.appointmentId))
      .innerJoin(group, eq(group.id, appointmentGrant.groupId))
      .where(
        and(
          inArray(positionAppointment.userId, userIds),
          inArray(group.type, [GroupType.Choir, GroupType.Section]),
          eq(group.active, true),
          lte(positionAppointment.startDate, date),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
        )
      )
  ])
  return [...new Map([...direct, ...grants].map((row) => [`${row.userId}:${row.groupId}`, row])).values()]
}

/** Public current read, using the same dated interpretation as historical lookups. */
export function listEffectiveParticipationOfUserCurrent(database: OrgStructureDatabase, userId: string) {
  return listEffectiveParticipationOfUserAt(database, userId, cskToday())
}

/** Compatibility export for callers that only need the Group rows. */
export async function listEffectiveGroupsOfUserAt(database: OrgStructureDatabase, userId: string, date: IsoDate) {
  return (await listEffectiveParticipationOfUserAt(database, userId, date)).groups
}
