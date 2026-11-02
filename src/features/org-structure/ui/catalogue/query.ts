import "server-only"

import { asc, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { group, groupTypePosition, position, positionGroup } from "@/core/db/schema/org-structure"
import type { GroupType } from "../../model"

/** A group a Position can be limited to, named with its Choir when it belongs to one. */
export type LimitGroup = { id: string; name: string; type: GroupType; choirName: string | null }

export type CataloguePosition = {
  id: string
  name: string
  groupTypes: GroupType[]
  /** The groups the Position is limited to; empty when every group of its types has it. */
  groups: LimitGroup[]
}

export type PositionCatalogueData = {
  positions: CataloguePosition[]
  /** Every active group, for limiting a Position to some of them. */
  groups: LimitGroup[]
}

/** Every Position with its GroupTypes and limit to groups, and the groups a limit can name. */
export async function listPositionCatalogue(): Promise<PositionCatalogueData> {
  await requirePermission({ action: "org.manage" })
  const choirGroup = alias(group, "choir_group")
  const [typeRows, limitRows, groupRows] = await Promise.all([
    db
      .select({ id: position.id, name: position.name, type: groupTypePosition.type })
      .from(position)
      .leftJoin(groupTypePosition, eq(groupTypePosition.positionId, position.id))
      .orderBy(asc(position.name)),
    db
      .select({
        positionId: positionGroup.positionId,
        id: group.id,
        name: group.name,
        type: group.type,
        choirName: choirGroup.name
      })
      .from(positionGroup)
      .innerJoin(group, eq(group.id, positionGroup.groupId))
      .leftJoin(choirGroup, eq(choirGroup.id, group.choirId))
      .orderBy(asc(group.name)),
    db
      .select({ id: group.id, name: group.name, type: group.type, choirName: choirGroup.name })
      .from(group)
      .leftJoin(choirGroup, eq(choirGroup.id, group.choirId))
      .where(eq(group.active, true))
      .orderBy(asc(group.name))
  ])

  const positions = new Map<string, CataloguePosition>()
  for (const { id, name, type } of typeRows) {
    const entry = positions.get(id) ?? { id, name, groupTypes: [], groups: [] }
    if (type) entry.groupTypes.push(type)
    positions.set(id, entry)
  }
  for (const { positionId, ...limitGroup } of limitRows) positions.get(positionId)?.groups.push(limitGroup)
  return { positions: [...positions.values()], groups: groupRows }
}
