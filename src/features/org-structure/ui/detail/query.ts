import "server-only"

import { and, asc, desc, eq, exists, isNotNull, isNull, notExists, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import {
  group,
  groupMember,
  groupTypePosition,
  position,
  positionGroup,
  positionHolder,
  section
} from "@/core/db/schema/org-structure"
import { compareVoices, divisionsOf, isVoiceDivision, type Voice, type VoiceDivision } from "@/features/voice/model"
import { listDirectMemberships } from "../../direct-membership"
import type { GroupType, IsoDate } from "../../model"

/** The Voices a singer can have in a Section singing `voice`: the division itself, or the family's divisions. */
const voicesWithin = (voice: Voice): VoiceDivision[] => (isVoiceDivision(voice) ? [voice] : divisionsOf(voice))

export type GroupDetail = NonNullable<Awaited<ReturnType<typeof getGroupDetail>>>

/** Everything the group detail page shows and offers, or null when there is no such group. */
export async function getGroupDetail(groupId: string) {
  const choirGroup = alias(group, "choir_group")
  const [row] = await db
    .select({
      id: group.id,
      name: group.name,
      type: group.type,
      active: group.active,
      organisationYear: group.organisationYear,
      usesAppointmentModel: group.usesAppointmentModel,
      choirId: group.choirId,
      choirName: choirGroup.name
    })
    .from(group)
    .leftJoin(choirGroup, eq(choirGroup.id, group.choirId))
    .where(eq(group.id, groupId))
  if (!row) return null
  const choirMember = alias(groupMember, "choir_member")

  const [memberships, holdings, allowed, [sectionRow], choirVoices, candidates, singers] = await Promise.all([
    db
      .select({
        userId: groupMember.userId,
        name: user.name,
        email: user.email,
        startDate: groupMember.startDate,
        endDate: groupMember.endDate,
        voice: groupMember.voice
      })
      .from(groupMember)
      .innerJoin(user, eq(user.id, groupMember.userId))
      .where(eq(groupMember.groupId, groupId))
      .orderBy(asc(user.name), desc(groupMember.startDate)),
    db
      .select({
        positionId: positionHolder.positionId,
        position: position.name,
        userId: positionHolder.userId,
        name: user.name,
        startDate: positionHolder.startDate,
        endDate: positionHolder.endDate
      })
      .from(positionHolder)
      .innerJoin(position, eq(position.id, positionHolder.positionId))
      .innerJoin(user, eq(user.id, positionHolder.userId))
      .where(eq(positionHolder.groupId, groupId))
      .orderBy(desc(positionHolder.startDate)),
    // The Positions the group's type allows, but not those limited to other groups.
    db
      .select({ id: position.id, name: position.name })
      .from(groupTypePosition)
      .innerJoin(position, eq(position.id, groupTypePosition.positionId))
      .where(
        and(
          eq(groupTypePosition.type, row.type),
          or(
            notExists(db.select().from(positionGroup).where(eq(positionGroup.positionId, position.id))),
            exists(
              db
                .select()
                .from(positionGroup)
                .where(and(eq(positionGroup.positionId, position.id), eq(positionGroup.groupId, groupId)))
            )
          )
        )
      )
      .orderBy(asc(position.name)),
    db.select({ voice: section.voice }).from(section).where(eq(section.groupId, groupId)),
    row.choirId ? choirVoicesOf(row.choirId) : Promise.resolve([]),
    // Active Users who are not current members, for the add-member picker. A Choir's group other
    // than a Section takes only current members of the Choir; placing a singer in a Section is
    // how they join it.
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(
        and(
          or(isNull(user.banned), eq(user.banned, false)),
          notExists(
            db
              .select()
              .from(groupMember)
              .where(
                and(eq(groupMember.userId, user.id), eq(groupMember.groupId, groupId), isNull(groupMember.endDate))
              )
          ),
          row.choirId && row.type !== "Section"
            ? exists(
                db
                  .select()
                  .from(choirMember)
                  .where(
                    and(
                      eq(choirMember.userId, user.id),
                      eq(choirMember.groupId, row.choirId),
                      isNull(choirMember.endDate)
                    )
                  )
              )
            : undefined
        )
      )
      .orderBy(asc(user.name)),
    // On a Choir's page, each member's Voice comes from their current Section Membership in it.
    row.type === "Choir"
      ? db
          .select({ userId: groupMember.userId, voice: groupMember.voice })
          .from(groupMember)
          .innerJoin(group, eq(group.id, groupMember.groupId))
          .where(and(eq(group.choirId, groupId), eq(group.type, "Section"), isNull(groupMember.endDate)))
      : Promise.resolve([])
  ])
  const singerVoices = new Map(singers.map(({ userId, voice }) => [userId, voice]))

  const current = holdings.filter(({ endDate }) => endDate === null)
  return {
    group: {
      id: row.id,
      name: row.name,
      type: row.type as GroupType,
      active: row.active,
      organisationYear: row.organisationYear,
      usesAppointmentModel: row.usesAppointmentModel,
      choir: row.choirId ? { id: row.choirId, name: row.choirName as string } : null
    },
    /** The Section's own Voice, or null for any other group. */
    sectionVoice: sectionRow?.voice ?? null,
    directMemberships: await listDirectMemberships(db, groupId),
    legacyMemberships: memberships,
    choirs: await db
      .select({ id: group.id, name: group.name })
      .from(group)
      .where(and(eq(group.type, "Choir"), eq(group.active, true)))
      .orderBy(group.name),
    placementSections:
      row.type === "Section" && row.choirId
        ? await db
            .select({ id: group.id, name: group.name })
            .from(group)
            .where(and(eq(group.type, "Section"), eq(group.choirId, row.choirId), eq(group.active, true)))
            .orderBy(group.name)
        : [],
    directCandidates: await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(or(isNull(user.banned), eq(user.banned, false)))
      .orderBy(user.name),
    /** The Voices a singer in this Section can have. */
    sectionVoices: sectionRow ? voicesWithin(sectionRow.voice) : [],
    choirVoices,
    members: memberships
      .filter(({ endDate }) => endDate === null)
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        startDate: member.startDate as IsoDate,
        voice: member.voice ?? singerVoices.get(member.userId) ?? null,
        positions: current.filter(({ userId }) => userId === member.userId).map(({ position }) => position)
      })),
    pastMembers: memberships
      .filter(({ endDate }) => endDate !== null)
      .map(({ userId, name, startDate, endDate, voice }) => ({
        userId,
        name,
        startDate,
        endDate: endDate as IsoDate,
        voice
      })),
    positions: allowed.map(({ id, name }) => {
      const holder = current.find(({ positionId }) => positionId === id)
      return {
        id,
        name,
        holder: holder ? { userId: holder.userId, name: holder.name, startDate: holder.startDate } : null
      }
    }),
    pastHolders: holdings
      .filter(({ endDate }) => endDate !== null)
      .map(({ position, name, startDate, endDate }) => ({
        position,
        name,
        startDate,
        endDate: endDate as IsoDate
      })),
    candidates
  }
}

/** Every Voice a singer can have in the Choir's active Sections, for changing a singer's Voice or Section. */
async function choirVoicesOf(choirId: string): Promise<VoiceDivision[]> {
  const rows = await db
    .select({ voice: section.voice })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .where(and(eq(group.choirId, choirId), eq(group.type, "Section"), eq(group.active, true)))
  return rows.flatMap(({ voice }) => voicesWithin(voice)).sort(compareVoices)
}

/** The Choir a group belongs to, for commands that are addressed by Choir. */
export async function getChoirIdOf(groupId: string) {
  const [row] = await db
    .select({ choirId: group.choirId })
    .from(group)
    .where(and(eq(group.id, groupId), isNotNull(group.choirId)))
  return row?.choirId ?? null
}
