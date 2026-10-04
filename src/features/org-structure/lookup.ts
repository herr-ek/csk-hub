import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { group, groupMember } from "@/core/db/schema/org-structure"
import { type OrgStructureTransaction, RuleViolation } from "./operation"

export type GroupRow = typeof group.$inferSelect

/** The group, locked against concurrent archiving for the rest of the command. */
export async function requireGroup(tx: OrgStructureTransaction, groupId: string): Promise<GroupRow> {
  const [row] = await tx.select().from(group).where(eq(group.id, groupId)).for("share")
  if (!row) throw new RuleViolation("group-not-found")
  return row
}

export async function requireActiveGroup(tx: OrgStructureTransaction, groupId: string): Promise<GroupRow> {
  const row = await requireGroup(tx, groupId)
  if (!row.active) throw new RuleViolation("group-archived")
  return row
}

export async function requireChoir(tx: OrgStructureTransaction, choirId: string): Promise<GroupRow> {
  const row = await requireGroup(tx, choirId).catch((error) => {
    throw error instanceof RuleViolation ? new RuleViolation("choir-not-found") : error
  })
  if (row.type !== "Choir") throw new RuleViolation("choir-not-found")
  if (!row.active) throw new RuleViolation("group-archived")
  return row
}

export async function findCurrentMembership(tx: OrgStructureTransaction, userId: string, groupId: string) {
  const [row] = await tx
    .select()
    .from(groupMember)
    .where(and(eq(groupMember.userId, userId), eq(groupMember.groupId, groupId), isNull(groupMember.endDate)))
  return row
}
