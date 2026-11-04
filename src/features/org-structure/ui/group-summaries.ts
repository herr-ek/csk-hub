import "server-only"

import { io } from "next/cache"
import { db } from "@/core/db"
import { section } from "@/core/db/schema/org-structure"
import { getTranslations } from "@/core/i18n/server"
import { cskToday, type GroupType, positionCodeKey } from "@/core/org-structure"
import type { Voice } from "@/features/voice/model"
import { listAppointmentsForGroups, listEffectiveMembersForGroupsAt } from "../appointments"
import { listOrganisationGroups } from "../group-management"
import { listLocalizedGroupLabels } from "./group-labels"

export type GroupSummary = {
  id: string
  name: string
  type: GroupType
  choirId: string | null
  active: boolean
  memberCount: number
  voices: Voice[]
  holders: { position: string; holder: string }[]
}

/** Keeps the existing overview shape while counting effective dated Memberships. */
export async function listGroupSummaries(): Promise<GroupSummary[]> {
  await io()
  const date = cskToday()
  const [groups, sections, labels, positionLabel] = await Promise.all([
    listOrganisationGroups(db, date),
    db.select().from(section),
    listLocalizedGroupLabels(),
    getTranslations("Groups.positionLabels")
  ])
  const ids = groups.map(({ id }) => id)
  const [members, appointments] = await Promise.all([
    listEffectiveMembersForGroupsAt(db, ids, date),
    listAppointmentsForGroups(db, ids)
  ])
  return groups
    .filter((row) => row.phase !== "future")
    .map((row) => ({
      id: row.id,
      name: labels.get(row.id) ?? row.id,
      type: row.type,
      choirId: row.choirId,
      active: row.active && row.phase === "current",
      memberCount: members.get(row.id)?.length ?? 0,
      voices: sections.filter(({ groupId }) => groupId === row.id).map(({ voice }) => voice),
      holders: (appointments.get(row.id) ?? [])
        .filter((entry) => entry.startDate <= date && (entry.endDate === null || entry.endDate > date))
        .map((entry) => ({ position: positionLabel(positionCodeKey(entry.positionCode)), holder: entry.name }))
    }))
}
