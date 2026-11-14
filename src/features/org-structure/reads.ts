import "server-only"

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { group, groupMember, position, positionHolder, section } from "@/core/db/schema/org-structure"
import { divisionsOf, type VoiceFamily } from "@/features/voice/model"
import type { OrgStructureDatabase, OrgStructureTransaction } from "./operation"

/** The current members of a group, with the Voice each sings when the group is a Section. */
export function listCurrentGroupMembers(database: OrgStructureDatabase, groupId: string) {
  return database
    .select({ userId: groupMember.userId, startDate: groupMember.startDate, voice: groupMember.voice })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), isNull(groupMember.endDate)))
    .orderBy(asc(groupMember.startDate), asc(groupMember.userId))
}

/** The groups a user currently belongs to. */
export function listCurrentGroupsOfUser(database: OrgStructureDatabase, userId: string) {
  const owningChoir = alias(group, "owning_choir")
  return database
    .select({
      groupId: group.id,
      name: group.name,
      type: group.type,
      choirId: group.choirId,
      active: group.active,
      startDate: groupMember.startDate,
      voice: groupMember.voice,
      sectionVoice: section.voice,
      choirName: owningChoir.name
    })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .leftJoin(section, eq(section.groupId, group.id))
    .leftJoin(owningChoir, eq(owningChoir.id, group.choirId))
    .where(and(eq(groupMember.userId, userId), isNull(groupMember.endDate)))
    .orderBy(asc(group.name))
}

/** Current Position holdings with their Group identity; callers choose archive visibility. */
export function listCurrentPositionsOfUser(database: OrgStructureDatabase, userId: string) {
  return database
    .select({ groupId: positionHolder.groupId, positionId: position.id, name: position.name })
    .from(positionHolder)
    .innerJoin(position, eq(position.id, positionHolder.positionId))
    .where(and(eq(positionHolder.userId, userId), isNull(positionHolder.endDate)))
    .orderBy(asc(position.name), asc(positionHolder.groupId))
}

/** Batched Choir/Section summaries for a directory page, excluding archived Groups. */
export async function listCurrentChoirAffiliationsOfUsers(database: OrgStructureDatabase, userIds: string[]) {
  if (userIds.length === 0) return []
  return database
    .select({
      userId: groupMember.userId,
      groupId: group.id,
      name: group.name,
      type: group.type,
      choirId: group.choirId
    })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(
      and(
        inArray(groupMember.userId, userIds),
        isNull(groupMember.endDate),
        eq(group.active, true),
        inArray(group.type, ["Choir", "Section"])
      )
    )
    .orderBy(asc(group.name), asc(group.id))
}

/** Who currently holds a Position in a group, or null when it is vacant. */
export async function getCurrentPositionHolder(database: OrgStructureDatabase, groupId: string, positionId: string) {
  const [holder] = await database
    .select({ userId: positionHolder.userId, startDate: positionHolder.startDate })
    .from(positionHolder)
    .where(
      and(
        eq(positionHolder.groupId, groupId),
        eq(positionHolder.positionId, positionId),
        isNull(positionHolder.endDate)
      )
    )
  return holder ?? null
}

/**
 * The current singers of a Choir in one Voice family: members of the Sections whose Voice is in
 * that family (KKB, or MKB1 and MKB2, for B). "All basses" is never a group; it is found this way.
 */
export function listChoirMembersByVoiceFamily(database: OrgStructureDatabase, choirId: string, family: VoiceFamily) {
  return database
    .selectDistinct({ userId: groupMember.userId, sectionId: groupMember.groupId, voice: groupMember.voice })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .innerJoin(section, eq(section.groupId, group.id))
    .where(
      and(
        eq(group.choirId, choirId),
        eq(group.type, "Section"),
        isNull(groupMember.endDate),
        inArray(section.voice, [family, ...divisionsOf(family)])
      )
    )
    .orderBy(asc(groupMember.userId))
}

/**
 * Every active group, plus the given ones even if archived, for a picker that must keep a group
 * it already shows. Unordered; the caller decides how to present them.
 */
export function listActiveGroups(database: OrgStructureDatabase, alsoGroupIds: string[] = []) {
  return database
    .select({ id: group.id, name: group.name, type: group.type, active: group.active })
    .from(group)
    .where(or(eq(group.active, true), alsoGroupIds.length > 0 ? inArray(group.id, alsoGroupIds) : undefined))
}

/** The names of the given groups, archived or not, for showing what refers to them. */
export async function listGroupNames(database: OrgStructureDatabase, groupIds: string[]) {
  if (groupIds.length === 0) return []
  return database
    .select({ id: group.id, name: group.name })
    .from(group)
    .where(inArray(group.id, [...new Set(groupIds)]))
}

/**
 * Whether a group exists and is active, for another feature's command about to refer to it. The
 * group stays locked against concurrent archiving until the caller's transaction ends. Null when
 * there is no such group.
 */
export async function lockGroupForReference(tx: OrgStructureTransaction, groupId: string) {
  const [row] = await tx.select({ active: group.active }).from(group).where(eq(group.id, groupId)).for("share")
  return row ?? null
}
