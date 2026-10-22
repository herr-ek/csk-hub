import "server-only"

import { io } from "next/cache"
import { db } from "@/core/db"
import { section } from "@/core/db/schema/org-structure"
import { timeZone } from "@/core/i18n/time-zone"
import type { GroupType, PositionCode } from "@/core/org-structure"
import type { Voice } from "@/features/voice/model"
import { listAppointmentsForGroups, listEffectiveMembersForGroupsAt } from "../appointments"
import { listOrganisationGroups } from "../group-management"

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
  const [groups, sections] = await Promise.all([listOrganisationGroups(db, date), db.select().from(section)])
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
    const holders = appointments
      .filter(
        (appointment) =>
          appointment.startDate <= date &&
          (appointment.endDate === null || appointment.endDate > date) &&
          (appointment.contextGroupId === row.id ||
            members.some(
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
