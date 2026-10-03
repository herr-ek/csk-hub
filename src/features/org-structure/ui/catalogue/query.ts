import "server-only"

import { asc, eq } from "drizzle-orm"
import { db } from "@/core/db"
import { groupTypePosition, position } from "@/core/db/schema/org-structure"
import type { GroupType } from "../../model"

export type CataloguePosition = { id: string; name: string; groupTypes: GroupType[] }

/** Every Position with the GroupTypes it may be held in. */
export async function listPositionCatalogue(): Promise<CataloguePosition[]> {
  const rows = await db
    .select({ id: position.id, name: position.name, type: groupTypePosition.type })
    .from(position)
    .leftJoin(groupTypePosition, eq(groupTypePosition.positionId, position.id))
    .orderBy(asc(position.name))

  const positions = new Map<string, CataloguePosition>()
  for (const { id, name, type } of rows) {
    const entry = positions.get(id) ?? { id, name, groupTypes: [] }
    if (type) entry.groupTypes.push(type)
    positions.set(id, entry)
  }
  return [...positions.values()]
}
