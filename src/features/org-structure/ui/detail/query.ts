import "server-only"

import { and, asc, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, section } from "@/core/db/schema/org-structure"
import { getTranslations } from "@/core/i18n/server"
import {
  cskToday,
  currentOrganisationYear,
  GROUP_POLICIES,
  GroupType,
  type IsoDate,
  POSITION_DEFINITIONS,
  type PositionCode,
  positionCodeKey,
  shiftDate
} from "@/core/org-structure"
import { compareVoices, divisionsOf, isVoiceDivision, type Voice, type VoiceDivision } from "@/features/voice/model"
import { listAppointmentsForGroup, listEffectiveMembersAt } from "../../appointments"
import { listDirectMemberships } from "../../direct-membership"
import { listOrganisationGroups } from "../../group-management"
import { listLocalizedGroupLabels } from "../group-labels"

const voicesWithin = (voice: Voice): VoiceDivision[] => (isVoiceDivision(voice) ? [voice] : divisionsOf(voice))
export type GroupDetail = NonNullable<Awaited<ReturnType<typeof getGroupDetail>>>

/** Adapts dated participation to the existing Group detail screen. */
export async function getGroupDetail(groupId: string, date: IsoDate = cskToday()) {
  const [groups, labels, positions, memberships, appointments, members, candidates, sections] = await Promise.all([
    listOrganisationGroups(db, date),
    listLocalizedGroupLabels(),
    getTranslations("Groups.positionLabels"),
    listDirectMemberships(db, groupId),
    listAppointmentsForGroup(db, groupId),
    listEffectiveMembersAt(db, groupId, date),
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(or(isNull(user.banned), eq(user.banned, false)))
      .orderBy(asc(user.name)),
    db.select().from(section)
  ])
  const row = groups.find(({ id }) => id === groupId)
  if (!row) return null
  const current = appointments.filter(
    (entry) => entry.startDate <= date && (entry.endDate === null || entry.endDate > date)
  )
  const label = (code: PositionCode) => positions(positionCodeKey(code))
  const sectionVoice = sections.find(({ groupId: id }) => id === groupId)?.voice ?? null
  const choirId = row.type === GroupType.Choir ? row.id : row.choirId
  const choirSections = groups.filter(
    (entry) => entry.choirId === choirId && entry.type === GroupType.Section && entry.active
  )
  const choirVoices = sections
    .filter((entry) => choirSections.some(({ id }) => id === entry.groupId))
    .flatMap(({ voice }) => voicesWithin(voice))
    .sort(compareVoices)
  const singers =
    row.type === GroupType.Choir
      ? await db
          .select({ userId: directMembership.userId, voice: directMembership.voice })
          .from(directMembership)
          .innerJoin(group, eq(group.id, directMembership.groupId))
          .where(
            and(
              eq(group.choirId, groupId),
              eq(group.type, GroupType.Section),
              lte(directMembership.startDate, date),
              or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
            )
          )
      : []
  const choirMembers = row.choirId ? await listEffectiveMembersAt(db, row.choirId, date) : []
  return {
    group: {
      id: row.id,
      name: labels.get(row.id) ?? row.id,
      type: row.type,
      active: row.active && row.phase === "current",
      organisationYear: row.organisationYear,
      choir: row.choirId ? { id: row.choirId, name: labels.get(row.choirId) ?? row.choirId } : null
    },
    sectionVoice,
    sectionVoices: sectionVoice ? voicesWithin(sectionVoice) : [],
    choirVoices,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
      startDate: [...member.memberships, ...member.positions].map(({ startDate }) => startDate).sort()[0] ?? date,
      voice: (member.voice ??
        singers.find(({ userId }) => userId === member.userId)?.voice ??
        null) as VoiceDivision | null,
      direct: member.memberships.length > 0,
      positions: current.filter(({ userId }) => userId === member.userId).map(({ positionCode }) => label(positionCode))
    })),
    pastMembers: [
      ...memberships,
      ...appointments
        .filter((entry) => (POSITION_DEFINITIONS[entry.positionCode].grants as readonly GroupType[]).includes(row.type))
        .map((entry) => ({ ...entry, voice: null }))
    ]
      .filter((entry) => entry.endDate !== null && entry.endDate <= date)
      .map((entry) => ({ ...entry, endDate: shiftDate(entry.endDate as IsoDate, -1) })),
    positions: (Object.entries(POSITION_DEFINITIONS) as [PositionCode, (typeof POSITION_DEFINITIONS)[PositionCode]][])
      .filter(([, definition]) => definition.context === row.type)
      .map(([code, definition]) => {
        const holder = current.find((entry) => entry.contextGroupId === groupId && entry.positionCode === code)
        return {
          id: code,
          name: label(code),
          prerequisite: definition.prerequisite,
          organisationYear:
            definition.endPolicy === "annual" ? (row.organisationYear ?? currentOrganisationYear(date)) : null,
          holder: holder
            ? { appointmentId: holder.id, userId: holder.userId, name: holder.name, startDate: holder.startDate }
            : null
        }
      }),
    pastHolders: appointments
      .filter((entry) => entry.contextGroupId === groupId && entry.endDate !== null && entry.endDate <= date)
      .map((entry) => ({
        position: label(entry.positionCode),
        name: entry.name,
        startDate: entry.startDate,
        endDate: shiftDate(entry.endDate as IsoDate, -1)
      })),
    candidates: candidates.filter(
      ({ id }) =>
        !members.some(({ userId }) => userId === id) &&
        (!row.choirId || row.type === GroupType.Section || choirMembers.some(({ userId }) => userId === id))
    ),
    appointmentCandidates: candidates,
    directMembershipAllowed: GROUP_POLICIES[row.type].directMembership !== "no"
  }
}

/** The Choir a group belongs to, for commands that are addressed by Choir. */
export async function getChoirIdOf(groupId: string) {
  const [row] = await db
    .select({ choirId: group.choirId })
    .from(group)
    .where(and(eq(group.id, groupId), isNotNull(group.choirId)))
  return row?.choirId ?? null
}

/** Identifies the Group policy before dispatching the existing membership form. */
export async function getGroupTypeOf(groupId: string) {
  const [row] = await db.select({ type: group.type }).from(group).where(eq(group.id, groupId))
  return row?.type ?? null
}
