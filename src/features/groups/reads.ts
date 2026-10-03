import "server-only"

import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { group, groupMember, positionHolder, sectionVoice } from "@/core/db/schema/groups"
import { type Part, voicesOfPart } from "./model"
import type { GroupsDatabase } from "./operation"

/** The current members of a group, with the Voice each sings when the group is a Section. */
export function listCurrentGroupMembers(database: GroupsDatabase, groupId: string) {
  return database
    .select({ userId: groupMember.userId, startDate: groupMember.startDate, voice: groupMember.voice })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), isNull(groupMember.endDate)))
    .orderBy(asc(groupMember.startDate), asc(groupMember.userId))
}

/** The groups a user currently belongs to. */
export function listCurrentGroupsOfUser(database: GroupsDatabase, userId: string) {
  return database
    .select({
      groupId: group.id,
      name: group.name,
      type: group.type,
      choirId: group.choirId,
      active: group.active,
      startDate: groupMember.startDate,
      voice: groupMember.voice
    })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(and(eq(groupMember.userId, userId), isNull(groupMember.endDate)))
    .orderBy(asc(group.name))
}

/** Who currently holds a Position in a group, or null when it is vacant. */
export async function getCurrentPositionHolder(database: GroupsDatabase, groupId: string, positionId: string) {
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
 * The current singers of a Choir in one Part: members of each Section whose Voices include a Voice
 * in that Part. "All basses" is never a group; it is found this way.
 */
export function listChoirMembersByPart(database: GroupsDatabase, choirId: string, part: Part) {
  return database
    .selectDistinct({ userId: groupMember.userId, sectionId: groupMember.groupId, voice: groupMember.voice })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .innerJoin(sectionVoice, eq(sectionVoice.sectionId, group.id))
    .where(
      and(
        eq(group.choirId, choirId),
        eq(group.type, "Section"),
        isNull(groupMember.endDate),
        inArray(sectionVoice.voice, voicesOfPart(part))
      )
    )
    .orderBy(asc(groupMember.userId))
}
