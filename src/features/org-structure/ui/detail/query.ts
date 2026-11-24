import "server-only"

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm"
import { requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, section } from "@/core/db/schema/org-structure"
import { cskToday, GroupType, type IsoDate, organisationYearPeriod } from "@/core/org-structure"
import { compareVoices, divisionsOf, isVoiceDivision, type Voice, type VoiceDivision } from "@/features/voice/model"
import { listAppointmentsForGroup, listEffectiveMembersAt } from "../../appointments"
import { listDirectMemberships } from "../../direct-membership"
import { listLocalizedGroupLabels } from "../group-labels"

const voicesWithin = (voice: Voice): VoiceDivision[] => (isVoiceDivision(voice) ? [voice] : divisionsOf(voice))

export type GroupDetail = NonNullable<Awaited<ReturnType<typeof getGroupDetail>>>

/** Everything the group detail page shows and offers, or null when the Group does not exist. */
export async function getGroupDetail(groupId: string, date: IsoDate = cskToday()) {
  await requirePermission({ action: "org.manage" })
  const [row] = await db
    .select({
      id: group.id,
      name: group.name,
      type: group.type,
      active: group.active,
      organisationYear: group.organisationYear,
      choirId: group.choirId
    })
    .from(group)
    .where(eq(group.id, groupId))
  if (!row) return null
  const labels = await listLocalizedGroupLabels()
  const label = (id: string) => labels.get(id) ?? id

  const [sectionRows, directMemberships, appointments, annualContexts, fluidContexts, candidates, choirs] =
    await Promise.all([
      db.select({ voice: section.voice }).from(section).where(eq(section.groupId, groupId)),
      listDirectMemberships(db, groupId),
      listAppointmentsForGroup(db, groupId),
      row.organisationYear !== null
        ? db
            .select({ id: group.id, name: group.name, active: group.active, organisationYear: group.organisationYear })
            .from(group)
            .where(and(eq(group.type, row.type), isNotNull(group.organisationYear)))
            .orderBy(desc(group.organisationYear))
        : Promise.resolve([]),
      db
        .select({ id: group.id, name: group.name, type: group.type, choirId: group.choirId })
        .from(group)
        .where(eq(group.type, row.type))
        .orderBy(asc(group.name)),
      db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(or(isNull(user.banned), eq(user.banned, false)))
        .orderBy(asc(user.name)),
      db
        .select({ id: group.id, name: group.name })
        .from(group)
        .where(eq(group.type, GroupType.Choir))
        .orderBy(asc(group.name))
    ])

  const choirVoices =
    row.type === GroupType.Choir || row.type === GroupType.Section
      ? await choirVoicesOf(row.type === GroupType.Choir ? row.id : (row.choirId ?? ""))
      : []
  const sectionVoice = sectionRows[0]?.voice ?? null
  const placementSections =
    row.type === GroupType.Section && row.choirId
      ? await db
          .select({ id: group.id, name: group.name, active: group.active })
          .from(group)
          .where(and(eq(group.type, GroupType.Section), eq(group.choirId, row.choirId)))
          .orderBy(asc(group.name))
      : []
  const effectiveMembers = await listEffectiveMembersAt(db, groupId, date)
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
  const contextIds = fluidContexts.map(({ id }) => id)
  const eligibleRows = contextIds.length
    ? await db
        .select({ userId: directMembership.userId })
        .from(directMembership)
        .where(inArray(directMembership.groupId, contextIds))
    : []
  const appointmentCandidates = candidates.filter(({ id }) => eligibleRows.some(({ userId }) => userId === id))
  const appointmentYears = await db
    .select({
      id: group.id,
      name: group.name,
      type: group.type,
      active: group.active,
      organisationYear: group.organisationYear
    })
    .from(group)
    .where(
      and(inArray(group.type, [GroupType.ConcertCommittee, GroupType.GigCommittee]), isNotNull(group.organisationYear))
    )
    .orderBy(desc(group.organisationYear))
  const historicalYear = (active: boolean, year: number | null) =>
    active || (year !== null && organisationYearPeriod(year).endDate <= date)

  return {
    group: {
      id: row.id,
      name: label(row.id),
      type: row.type,
      active: row.active,
      organisationYear: row.organisationYear,
      choir: row.choirId ? { id: row.choirId, name: label(row.choirId) } : null
    },
    sectionVoice,
    singerVoices: Object.fromEntries(singers.map(({ userId, voice }) => [userId, voice])),
    directMemberships,
    effectiveMembers: effectiveMembers.map((row) => ({
      ...row,
      positions: row.positions.map((position) => ({ ...position, contextName: label(position.contextGroupId) }))
    })),
    choirs: choirs.map((row) => ({ ...row, name: label(row.id) })),
    placementSections: placementSections.map((row) => ({ ...row, name: label(row.id) })),
    directCandidates: candidates,
    sectionVoices: sectionVoice ? voicesWithin(sectionVoice) : [],
    choirVoices,
    appointments: appointments.map((row) => ({ ...row, contextName: label(row.contextGroupId) })),
    annualContexts: annualContexts
      .filter(({ active, organisationYear }) => historicalYear(active, organisationYear))
      .map((row) => ({ ...row, name: label(row.id) })),
    fluidContexts: fluidContexts.map((row) => ({ ...row, name: label(row.id) })),
    appointmentYears: appointmentYears
      .map((row) => ({ ...row, name: label(row.id) }))
      .filter(({ active, organisationYear }) => historicalYear(active, organisationYear)),
    appointmentCandidates
  }
}

/** Every Voice a singer can have in the Choir's active Sections. */
async function choirVoicesOf(choirId: string): Promise<VoiceDivision[]> {
  if (!choirId) return []
  const rows = await db
    .select({ voice: section.voice })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .where(and(eq(group.choirId, choirId), eq(group.type, GroupType.Section), eq(group.active, true)))
  return rows.flatMap(({ voice }) => voicesWithin(voice)).sort(compareVoices)
}

/** The Choir a group belongs to, for commands that are addressed by Choir. */
export async function getChoirIdOf(groupId: string) {
  await requirePermission({ action: "org.manage" })
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
