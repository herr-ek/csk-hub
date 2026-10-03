import "server-only"

import { and, asc, desc, eq, isNotNull, isNull, notExists, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import {
  group,
  groupMember,
  groupTypePosition,
  position,
  positionHolder,
  section
} from "@/core/db/schema/org-structure"
import { divisionsOf, isVoiceDivision, type Voice } from "@/features/voice/model"
import type { GroupType, IsoDate } from "../../model"

const VOICE_ORDER: Voice[] = ["S", "S1", "S2", "A", "A1", "A2", "T", "T1", "T2", "B", "B1", "B2"]
const byVoice = (a: Voice, b: Voice) => VOICE_ORDER.indexOf(a) - VOICE_ORDER.indexOf(b)

/** The Voices a singer can have in a Section singing `voice`: the Voice itself and, for a family, its divisions. */
const voicesWithin = (voice: Voice): Voice[] => (isVoiceDivision(voice) ? [voice] : [voice, ...divisionsOf(voice)])

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
      choirId: group.choirId,
      choirName: choirGroup.name
    })
    .from(group)
    .leftJoin(choirGroup, eq(choirGroup.id, group.choirId))
    .where(eq(group.id, groupId))
  if (!row) return null

  const [memberships, holdings, allowed, [sectionRow], choirVoices, candidates] = await Promise.all([
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
    db
      .select({ id: position.id, name: position.name })
      .from(groupTypePosition)
      .innerJoin(position, eq(position.id, groupTypePosition.positionId))
      .where(eq(groupTypePosition.type, row.type))
      .orderBy(asc(position.name)),
    db.select({ voice: section.voice }).from(section).where(eq(section.groupId, groupId)),
    row.choirId ? choirVoicesOf(row.choirId) : Promise.resolve([]),
    // Active Users who are not current members, for the add-member picker.
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
          )
        )
      )
      .orderBy(asc(user.name))
  ])

  const current = holdings.filter(({ endDate }) => endDate === null)
  return {
    group: {
      id: row.id,
      name: row.name,
      type: row.type as GroupType,
      active: row.active,
      choir: row.choirId ? { id: row.choirId, name: row.choirName as string } : null
    },
    /** The Section's own Voice, or null for any other group. */
    sectionVoice: sectionRow?.voice ?? null,
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
        voice: member.voice,
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
async function choirVoicesOf(choirId: string): Promise<Voice[]> {
  const rows = await db
    .select({ voice: section.voice })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .where(and(eq(group.choirId, choirId), eq(group.type, "Section"), eq(group.active, true)))
  return rows.flatMap(({ voice }) => voicesWithin(voice)).sort(byVoice)
}

/** The Choir a group belongs to, for commands that are addressed by Choir. */
export async function getChoirIdOf(groupId: string) {
  const [row] = await db
    .select({ choirId: group.choirId })
    .from(group)
    .where(and(eq(group.id, groupId), isNotNull(group.choirId)))
  return row?.choirId ?? null
}
