import "server-only"

import { and, eq, ne, sql } from "drizzle-orm"
import { group } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, type GroupType } from "@/core/org-structure"
import { type OrgStructureTransaction, RuleViolation } from "./operation"

/** Serializes Choir-team creation/reclassification against the current concrete Group set. */
export async function requireChoirTeamAvailable(
  tx: OrgStructureTransaction,
  input: { type: GroupType; choirId?: string | null; exceptGroupId?: string }
) {
  if (GROUP_POLICIES[input.type].cardinality !== "choir-singleton" || !input.choirId) return
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:choir-team:${input.choirId}:${input.type}`}))`
  )
  const [existing] = await tx
    .select({ id: group.id })
    .from(group)
    .where(
      and(
        eq(group.type, input.type),
        eq(group.choirId, input.choirId),
        eq(group.active, true),
        input.exceptGroupId ? ne(group.id, input.exceptGroupId) : undefined
      )
    )
    .limit(1)
  if (existing) throw new RuleViolation("group-type-taken")
}
