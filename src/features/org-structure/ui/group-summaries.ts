import "server-only"

import { and, asc, count, eq, gt, isNull, lte, or } from "drizzle-orm"
import { io } from "next/cache"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { directMembership, groupMember, position, positionHolder, section } from "@/core/db/schema/org-structure"
import { timeZone } from "@/core/i18n/time-zone"
import type { Voice } from "@/features/voice/model"
import { listAppointmentsForGroup, listEffectiveMembersAt } from "../appointments"
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
  const [groups, counts, directCounts, sections, legacyHolders] = await Promise.all([
    listOrganisationGroups(db, date),
    db
      .select({ groupId: groupMember.groupId, members: count() })
      .from(groupMember)
      .where(and(lte(groupMember.startDate, date), or(isNull(groupMember.endDate), gt(groupMember.endDate, date))))
      .groupBy(groupMember.groupId),
    db
      .select({ groupId: directMembership.groupId, members: count() })
      .from(directMembership)
      .where(
        and(
          lte(directMembership.startDate, date),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
        )
      )
      .groupBy(directMembership.groupId),
    db.select().from(section),
    db
      .select({ groupId: positionHolder.groupId, position: position.name, holder: user.name })
      .from(positionHolder)
      .innerJoin(position, eq(position.id, positionHolder.positionId))
      .innerJoin(user, eq(user.id, positionHolder.userId))
      .where(isNull(positionHolder.endDate))
      .orderBy(asc(position.name))
  ])

  const memberCounts = new Map(counts.map(({ groupId, members }) => [groupId, members]))
  const directMemberCounts = new Map(directCounts.map(({ groupId, members }) => [groupId, members]))
  return Promise.all(
    groups.map(async (row) => {
      const [members, appointments] = row.usesAppointmentModel
        ? await Promise.all([listEffectiveMembersAt(db, row.id, date), listAppointmentsForGroup(db, row.id)])
        : [null, null]
      const holders = row.usesAppointmentModel
        ? (appointments ?? [])
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
        memberCount: members?.length ?? (directMemberCounts.get(row.id) ?? 0) + (memberCounts.get(row.id) ?? 0),
        voices: sections.filter(({ groupId }) => groupId === row.id).map(({ voice }) => voice),
        holders
      }
    })
  )
}
