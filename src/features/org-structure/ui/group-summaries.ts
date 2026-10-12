import "server-only"

import { asc, count, eq, isNull } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, position, positionHolder, section } from "@/core/db/schema/org-structure"
import type { Voice } from "@/features/voice/model"
import type { GroupType } from "../model"

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

/** Every group, archived ones included, with what the admin overviews show of it, ordered by name. */
export async function listGroupSummaries(): Promise<GroupSummary[]> {
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
  return groups.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    choirId: row.choirId,
    active: row.active,
    memberCount: memberCounts.get(row.id) ?? 0,
    voices: sections.filter(({ groupId }) => groupId === row.id).map(({ voice }) => voice),
    holders: holders.filter(({ groupId }) => groupId === row.id).map(({ position, holder }) => ({ position, holder }))
  }))
}
