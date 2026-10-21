import "server-only"

import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm"
import { io } from "next/cache"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { group, position, positionHolder, section } from "@/core/db/schema/org-structure"
import { timeZone } from "@/core/i18n/time-zone"
import type { Voice } from "@/features/voice/model"
import { listAppointmentsForGroups, listEffectiveMembersForGroupsAt } from "../appointments"
import { listOrganisationGroups } from "../group-management"
import type { GroupType, PositionCode } from "../model"

export type GroupSummary = {
  id: string
  name: string
  type: GroupType
  choirId: string | null
  organisationYear: number | null
  phase: "future" | "current" | "completed"
  active: boolean
  memberCount: number
  voices: Voice[]
  holders: { id: string; positionCode: PositionCode | null; position: string; context: string | null; holder: string }[]
}

/** Every group, archived ones included, with what the admin overviews show of it, ordered by name. */
export async function listGroupSummaries(): Promise<GroupSummary[]> {
  await io()
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())
  const [groups, sections, legacyHolders] = await Promise.all([
    listOrganisationGroups(db, date),
    db.select().from(section),
    db
      .select({ groupId: positionHolder.groupId, position: position.name, holder: user.name })
      .from(positionHolder)
      .innerJoin(position, eq(position.id, positionHolder.positionId))
      .innerJoin(user, eq(user.id, positionHolder.userId))
      .innerJoin(group, eq(group.id, positionHolder.groupId))
      .where(
        and(
          eq(group.usesAppointmentModel, false),
          lte(positionHolder.startDate, date),
          or(isNull(positionHolder.endDate), gt(positionHolder.endDate, date))
        )
      )
      .orderBy(asc(position.name))
  ])
  const [effectiveMembers, appointmentsByGroup] = await Promise.all([
    listEffectiveMembersForGroupsAt(
      db,
      groups.map((row) => row.id),
      date
    ),
    listAppointmentsForGroups(
      db,
      groups.map((row) => row.id)
    )
  ])
  return groups.map((row) => {
    const members = effectiveMembers.get(row.id) ?? []
    const appointments = appointmentsByGroup.get(row.id) ?? []
    const holders = row.usesAppointmentModel
      ? appointments
          .filter(
            (appointment) =>
              appointment.startDate <= date &&
              (appointment.endDate === null || appointment.endDate > date) &&
              (appointment.contextGroupId === row.id ||
                (members ?? []).some(
                  (member) =>
                    member.userId === appointment.userId &&
                    member.positions.some((position) => position.id === appointment.id)
                ))
          )
          .map((appointment) => ({
            id: appointment.id,
            positionCode: appointment.positionCode,
            position: appointment.position,
            context: appointment.contextName,
            holder: appointment.name
          }))
      : legacyHolders
          .filter(({ groupId }) => groupId === row.id)
          .map((holder) => ({
            id: `${holder.groupId}:${holder.position}:${holder.holder}`,
            positionCode: null,
            position: holder.position,
            context: null,
            holder: holder.holder
          }))
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      choirId: row.choirId,
      active: row.active,
      organisationYear: row.organisationYear,
      phase: row.phase,
      memberCount: members.length,
      voices: sections.filter(({ groupId }) => groupId === row.id).map(({ voice }) => voice),
      holders
    }
  })
}
