import "server-only"

import { asc, count, eq, isNull } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, position, positionHolder, section } from "@/core/db/schema/org-structure"
import type { Voice } from "@/features/voice/model"
import type { GroupType } from "../../model"

export type GroupSummary = {
  id: string
  name: string
  type: GroupType
  active: boolean
  memberCount: number
  voices: Voice[]
  holders: { position: string; holder: string }[]
}

export type GroupStructure = {
  /** CSK-wide groups other than the Choirs, ordered by type then name. */
  cskWide: GroupSummary[]
  choirs: { choir: GroupSummary; sections: GroupSummary[]; groups: GroupSummary[] }[]
}

const VOICE_ORDER: Voice[] = ["S", "S1", "S2", "A", "A1", "A2", "T", "T1", "T2", "B", "B1", "B2"]

/** The whole structure, archived groups included, shaped for the admin overview. */
export async function getGroupStructure(): Promise<GroupStructure> {
  const [groups, counts, sections, holders] = await Promise.all([
    db.select().from(group).orderBy(asc(group.name)),
    db
      .select({ groupId: groupMember.groupId, members: count() })
      .from(groupMember)
      .where(isNull(groupMember.endDate))
      .groupBy(groupMember.groupId),
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
  const summary = (row: (typeof groups)[number]): GroupSummary => ({
    id: row.id,
    name: row.name,
    type: row.type,
    active: row.active,
    memberCount: memberCounts.get(row.id) ?? 0,
    voices: sections.filter(({ groupId }) => groupId === row.id).map(({ voice }) => voice),
    holders: holders.filter(({ groupId }) => groupId === row.id).map(({ position, holder }) => ({ position, holder }))
  })

  const sectionOrder = (section: GroupSummary) => VOICE_ORDER.indexOf(section.voices[0] as Voice)

  return {
    cskWide: groups
      .filter((row) => row.choirId === null && row.type !== "Choir")
      .map(summary)
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "sv")),
    choirs: groups
      .filter((row) => row.type === "Choir")
      .map((choirRow) => {
        const owned = groups.filter((row) => row.choirId === choirRow.id).map(summary)
        return {
          choir: summary(choirRow),
          sections: owned.filter(({ type }) => type === "Section").sort((a, b) => sectionOrder(a) - sectionOrder(b)),
          groups: owned.filter(({ type }) => type !== "Section")
        }
      })
  }
}
