import "server-only"

import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import { directMembership, group, groupMember, positionHolder, section } from "@/core/db/schema/org-structure"
import { divisionsOf, type VoiceFamily } from "@/features/voice/model"
import { listEffectiveMembersAt } from "./appointments"
import {
  cskToday,
  listEffectiveChoirAffiliationsOfUsersAt,
  listEffectiveParticipationOfUserAt
} from "./effective-reads"
import type { OrgStructureDatabase } from "./operation"

/** The current members of a group, with the Voice each sings when the group is a Section. */
export function listCurrentGroupMembers(database: OrgStructureDatabase, groupId: string) {
  const date = cskToday()
  return listEffectiveMembersAt(database, groupId, date).then((members) =>
    members
      .flatMap((member) => {
        const startDate = [
          ...member.memberships.map(({ startDate }) => startDate),
          ...member.positions.map(({ startDate }) => startDate)
        ].sort()[0]
        return startDate ? [{ userId: member.userId, startDate, voice: member.voice }] : []
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userId.localeCompare(b.userId))
  )
}

/** The groups a user currently belongs to. */
export async function listCurrentGroupsOfUser(database: OrgStructureDatabase, userId: string, date = cskToday()) {
  return (await listEffectiveParticipationOfUserAt(database, userId, date)).groups.map(
    ({ groupId, name, type, choirId, active, startDate, voice, sectionVoice, choirName }) => ({
      groupId,
      name,
      type,
      choirId,
      active,
      startDate,
      voice,
      sectionVoice,
      choirName
    })
  )
}

/** Current Position holdings with their Group identity; callers choose archive visibility. */
export async function listCurrentPositionsOfUser(database: OrgStructureDatabase, userId: string, date = cskToday()) {
  return (await listEffectiveParticipationOfUserAt(database, userId, date)).positions
    .flatMap((item) =>
      item.affiliationGroups.map((entry) => ({ groupId: entry.id, positionId: item.id, name: item.name }))
    )
    .sort((a, b) => a.name.localeCompare(b.name, "sv") || a.groupId.localeCompare(b.groupId))
}

/** Batched Choir/Section summaries for a directory page, excluding archived Groups. */
export async function listCurrentChoirAffiliationsOfUsers(
  database: OrgStructureDatabase,
  userIds: string[],
  date = cskToday()
) {
  return listEffectiveChoirAffiliationsOfUsersAt(database, userIds, date)
}

/** Who currently holds a Position in a group, or null when it is vacant. */
export async function getCurrentPositionHolder(
  database: OrgStructureDatabase,
  groupId: string,
  positionId: string,
  date = cskToday()
) {
  const [holder] = await database
    .select({ userId: positionHolder.userId, startDate: positionHolder.startDate })
    .from(positionHolder)
    .where(
      and(
        eq(positionHolder.groupId, groupId),
        eq(positionHolder.positionId, positionId),
        lte(positionHolder.startDate, date),
        or(isNull(positionHolder.endDate), gt(positionHolder.endDate, date))
      )
    )
  return holder ?? null
}

/**
 * The current singers of a Choir in one Voice family: members of the Sections whose Voice is in
 * that family (KKB, or MKB1 and MKB2, for B). "All basses" is never a group; it is found this way.
 */
export async function listChoirMembersByVoiceFamily(
  database: OrgStructureDatabase,
  choirId: string,
  family: VoiceFamily,
  date = cskToday()
) {
  const voices = [family, ...divisionsOf(family)]
  const [direct, legacy] = await Promise.all([
    database
      .select({ userId: directMembership.userId, sectionId: directMembership.groupId, voice: directMembership.voice })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .innerJoin(section, eq(section.groupId, group.id))
      .where(
        and(
          eq(group.choirId, choirId),
          eq(group.type, "Section"),
          eq(group.active, true),
          inArray(section.voice, voices),
          lte(directMembership.startDate, date),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
        )
      ),
    database
      .select({ userId: groupMember.userId, sectionId: groupMember.groupId, voice: groupMember.voice })
      .from(groupMember)
      .innerJoin(group, eq(group.id, groupMember.groupId))
      .innerJoin(section, eq(section.groupId, group.id))
      .where(
        and(
          eq(group.choirId, choirId),
          eq(group.type, "Section"),
          eq(group.active, true),
          eq(group.usesAppointmentModel, false),
          inArray(section.voice, voices),
          lte(groupMember.startDate, date),
          or(isNull(groupMember.endDate), gt(groupMember.endDate, date))
        )
      )
  ])
  return [...new Map([...direct, ...legacy].map((row) => [`${row.userId}:${row.sectionId}`, row])).values()].sort(
    (a, b) => a.userId.localeCompare(b.userId)
  )
}
