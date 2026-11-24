import "server-only"

import { type AnyColumn, and, asc, eq, gt, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm"
import { directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { GroupType, type IsoDate, type PositionCode } from "@/core/org-structure"
import { divisionsOf, type VoiceFamily } from "@/features/voice/model"
import { appointmentMemberships } from "./appointment-memberships"
import { listEffectiveMembersAt } from "./appointments"
import {
  cskToday,
  listEffectiveChoirAffiliationsOfUsersAt,
  listEffectiveParticipationOfUserAt
} from "./effective-reads"
import { lockUser, type OrgStructureDatabase, type OrgStructureTransaction } from "./operation"

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

/**
 * Effective dated Memberships whose exclusive end lies after `from`, including appointment
 * grants. Archived Groups remain available for historical Event audiences.
 */
export async function listMembershipsOfUser(
  database: OrgStructureDatabase,
  userId: string,
  { from }: { from: IsoDate }
) {
  const rows = await datedMemberships(database, userId, (period) =>
    or(isNull(period.endDate), gt(period.endDate, from))
  )
  return rows.map(({ userId: _, ...membership }) => membership)
}

/**
 * Every User's effective Memberships active on `date`, appointment grants included, for the Users
 * who are members of one of `groupIds` that day; null means members of any group. Each User comes
 * with all their Memberships of the day, not only the matching ones, so a caller can apply the
 * Event audience rule, whose Voice families are found through Section Memberships.
 */
export async function listMembershipsOnDate(database: OrgStructureDatabase, date: IsoDate, groupIds: string[] | null) {
  // shortcut: reads every Membership of the day and filters here; fine at CSK's size, push the
  // group filter into SQL if Membership counts grow into the tens of thousands.
  const rows = await datedMemberships(database, undefined, (period) =>
    and(lte(period.startDate, date), or(isNull(period.endDate), gt(period.endDate, date)))
  )
  if (groupIds === null) return rows
  const members = new Set(rows.filter(({ groupId }) => groupIds.includes(groupId)).map(({ userId }) => userId))
  return rows.filter(({ userId }) => members.has(userId))
}

/** Direct and appointment-derived Memberships, optionally of one User, whose period `within` accepts. */
async function datedMemberships(
  database: OrgStructureDatabase,
  userId: string | undefined,
  within: (period: { startDate: AnyColumn; endDate: AnyColumn }) => SQL | undefined
) {
  const derived = appointmentMemberships(database)
  const [direct, granted] = await Promise.all([
    database
      .select({
        userId: directMembership.userId,
        groupId: group.id,
        groupType: group.type,
        choirId: group.choirId,
        voice: directMembership.voice,
        startDate: directMembership.startDate,
        endDate: directMembership.endDate
      })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .where(and(userId ? eq(directMembership.userId, userId) : undefined, within(directMembership))),
    database
      .select({
        userId: positionAppointment.userId,
        groupId: group.id,
        groupType: group.type,
        choirId: group.choirId,
        voice: sql<null>`NULL`,
        startDate: positionAppointment.startDate,
        endDate: positionAppointment.endDate
      })
      .from(derived)
      .innerJoin(group, eq(group.id, derived.groupId))
      .innerJoin(positionAppointment, eq(positionAppointment.id, derived.appointmentId))
      .where(and(userId ? eq(positionAppointment.userId, userId) : undefined, within(positionAppointment)))
  ])
  return [...direct, ...granted].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.groupId.localeCompare(b.groupId)
  )
}

/** Who currently holds a Position in a group, or null when it is vacant. */
export async function getCurrentPositionHolder(
  database: OrgStructureDatabase,
  groupId: string,
  positionCode: PositionCode,
  date = cskToday()
) {
  const [holder] = await database
    .select({ userId: positionAppointment.userId, startDate: positionAppointment.startDate })
    .from(positionAppointment)
    .where(
      and(
        eq(positionAppointment.contextGroupId, groupId),
        eq(positionAppointment.positionCode, positionCode),
        lte(positionAppointment.startDate, date),
        or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, date))
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
  const rows = await database
    .select({ userId: directMembership.userId, sectionId: directMembership.groupId, voice: directMembership.voice })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .innerJoin(section, eq(section.groupId, group.id))
    .where(
      and(
        eq(group.choirId, choirId),
        eq(group.type, GroupType.Section),
        eq(group.active, true),
        inArray(section.voice, voices),
        lte(directMembership.startDate, date),
        or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
      )
    )
  return [...new Map(rows.map((row) => [`${row.userId}:${row.sectionId}`, row])).values()].sort((a, b) =>
    a.userId.localeCompare(b.userId)
  )
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

/** The names and types of the given groups, archived or not, for showing what refers to them. */
export async function listGroupNames(database: OrgStructureDatabase, groupIds: string[]) {
  if (groupIds.length === 0) return []
  return database
    .select({ id: group.id, name: group.name, type: group.type })
    .from(group)
    .where(inArray(group.id, [...new Set(groupIds)]))
}

/**
 * Whether a group exists, its type and whether it is active, for another feature's command about to refer to it. The
 * group stays locked against concurrent archiving until the caller's transaction ends. Null when
 * there is no such group.
 */
export async function lockGroupForReference(tx: OrgStructureTransaction, groupId: string) {
  const [row] = await tx
    .select({ active: group.active, type: group.type })
    .from(group)
    .where(eq(group.id, groupId))
    .for("share")
  return row ?? null
}

/**
 * Complete Group relationship facts for authorization, without deciding permissions.
 * Unlike summary reads, these retain User IDs and both period boundaries.
 */
export async function getGroupAuthorizationFacts(database: OrgStructureDatabase, userId: string) {
  const groups = await database.select({ id: group.id, type: group.type, active: group.active }).from(group)
  const positionAppointments = await database
    .select()
    .from(positionAppointment)
    .where(eq(positionAppointment.userId, userId))
  return { groups, positionAppointments }
}

/**
 * Lock the actor's organisational relationships against departure/handover, then the named
 * Groups against archival, until the transaction ends. Call before taking Event locks.
 * Uses the same User advisory lock as organisational commands; acquires no Position slot locks.
 */
export async function lockGroupAuthorizationFacts(tx: OrgStructureTransaction, userId: string, groupIds: string[]) {
  await lockUser(tx, userId)
  if (groupIds.length > 0) {
    await tx
      .select({ id: group.id })
      .from(group)
      .where(inArray(group.id, [...new Set(groupIds)].sort()))
      // Choir archival locks its Choir before updating Sections; preserve that order here.
      .orderBy(sql`case when ${group.type} = ${GroupType.Choir} then 0 else 1 end`, asc(group.id))
      .for("share")
  }
  return getGroupAuthorizationFacts(tx, userId)
}
