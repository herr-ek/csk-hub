import "server-only"

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { voiceCapability } from "@/core/db/schema/voice"
import {
  COMMITTEE_TYPES,
  type CommitteeType,
  currentOrganisationYear,
  GROUP_POLICIES,
  GroupType,
  type IsoDate,
  organisationYearPeriod,
  POSITION_DEFINITIONS,
  PositionCode,
  sectionName,
  shiftDate
} from "@/core/org-structure"
import {
  compareVoices,
  isVoiceDivision,
  type Voice,
  type VoiceDivision,
  type VoiceFamily
} from "@/features/voice/model"
import type { OrgStructureDatabase } from "./operation"
import { type Placement, tenureStatus, yearPhase } from "./roster"

const activeUser = or(isNull(user.banned), eq(user.banned, false))

function coversDate(date: IsoDate) {
  return and(
    lte(directMembership.startDate, date),
    or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
  )
}

export type SingerPlacement = Placement & {
  membershipId: string
  sectionId: string
  sectionName: string
  startDate: IsoDate
  /** The first day of a planned change away from this placement. */
  endDate: IsoDate | null
}

export type Person = {
  id: string
  name: string
  choirs: { id: string; name: string; since: IsoDate }[]
  placements: SingerPlacement[]
  /** Section placements still to begin. */
  planned: SingerPlacement[]
  /** Every Voice division they declare or sing in a Section. */
  voices: VoiceDivision[]
}

/** Every active User with the Choirs, Section placements and Voices they have on a date, and placements to come. */
export async function listPeople(database: OrgStructureDatabase, date: IsoDate): Promise<Person[]> {
  const owningChoir = alias(group, "person_owning_choir")
  const [users, memberships, capabilities] = await Promise.all([
    database.select({ id: user.id, name: user.name }).from(user).where(activeUser).orderBy(asc(user.name)),
    database
      .select({
        membership: directMembership,
        type: group.type,
        name: group.name,
        choirId: group.choirId,
        choirName: owningChoir.name,
        sectionVoice: section.voice
      })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .leftJoin(owningChoir, eq(owningChoir.id, group.choirId))
      .leftJoin(section, eq(section.groupId, group.id))
      .where(
        and(
          inArray(group.type, [GroupType.Choir, GroupType.Section]),
          eq(group.active, true),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
        )
      ),
    database.select().from(voiceCapability)
  ])
  return users
    .map(({ id, name }) => {
      const own = memberships.filter(({ membership }) => membership.userId === id)
      const choirs = own
        .filter(({ type, membership }) => type === GroupType.Choir && membership.startDate <= date)
        .map((row) => ({
          id: row.membership.groupId,
          name: row.name ?? "",
          since: row.membership.startDate as IsoDate
        }))
      const all = own.flatMap(({ membership, type, choirId, choirName, sectionVoice }) =>
        type === GroupType.Section && choirId && sectionVoice && membership.voice
          ? [
              {
                membershipId: membership.id,
                choirId,
                choirName: choirName ?? "",
                sectionId: membership.groupId,
                sectionName: sectionName(choirName, sectionVoice),
                divided: isVoiceDivision(sectionVoice),
                voice: membership.voice,
                choirSince: choirs.find((choir) => choir.id === choirId)?.since ?? (membership.startDate as IsoDate),
                startDate: membership.startDate as IsoDate,
                endDate: membership.endDate as IsoDate | null
              }
            ]
          : []
      )
      const placements = all.filter(({ startDate }) => startDate <= date)
      const planned = all.filter(({ startDate }) => startDate > date)
      const declared = capabilities.filter(({ userId }) => userId === id).map(({ voice }) => voice)
      const voices = [...new Set([...declared, ...placements.map(({ voice }) => voice)])].sort(compareVoices)
      return { id, name, choirs, placements, planned, voices }
    })
    .sort((a, b) => a.name.localeCompare(b.name, "sv"))
}

export type ChoirStructure = { id: string; name: string; sections: { id: string; name: string; voice: Voice }[] }

/** The active Choirs and their Sections, in reference order: MK, DK, KK, highest Voice first. */
export async function listChoirs(database: OrgStructureDatabase): Promise<ChoirStructure[]> {
  const [choirs, sections] = await Promise.all([
    database
      .select({ id: group.id, name: group.name })
      .from(group)
      .where(and(eq(group.type, GroupType.Choir), eq(group.active, true))),
    database
      .select({ id: group.id, choirId: group.choirId, voice: section.voice })
      .from(group)
      .innerJoin(section, eq(section.groupId, group.id))
      .where(eq(group.active, true))
  ])
  return choirs
    .map(({ id, name }) => ({
      id,
      name: name ?? "",
      sections: sections
        .filter(({ choirId }) => choirId === id)
        .sort((a, b) => compareVoices(a.voice, b.voice))
        .map((row) => ({ id: row.id, name: sectionName(name, row.voice), voice: row.voice }))
    }))
    .sort((a, b) => choirOrder(a) - choirOrder(b) || a.name.localeCompare(b.name, "sv"))
}

/** Divided Choirs first, lowest Voices leading, as CSK names them: MK, DK, KK. */
function choirOrder({ sections }: ChoirStructure) {
  if (sections.some(({ voice }) => !isVoiceDivision(voice))) return 2
  return sections.some(({ voice }) => voice.startsWith("B")) ? 0 : 1
}

export type SlotHolder = {
  appointmentId: string
  userId: string
  name: string
  inactive: boolean
  startDate: IsoDate
  endDate: IsoDate | null
}

export type PositionSlot = {
  key: string
  positionCode: PositionCode
  contextType: GroupType
  /** Null for an annual Group that its year has not been set up with yet. */
  contextGroupId: string | null
  choir: { id: string; name: string } | null
  section: { id: string; name: string } | null
  organisationYear: number | null
  holders: SlotHolder[]
}

/**
 * Every Position and who holds it in a year, vacant ones included, except Gigledare, who belong to
 * their gig groups. Ongoing Positions list today's and planned holders whatever the year.
 */
export async function listPositionSlots(
  database: OrgStructureDatabase,
  year: number,
  today: IsoDate
): Promise<PositionSlot[]> {
  const [choirs, annualGroups, appointments] = await Promise.all([
    listChoirs(database),
    database.select({ id: group.id, type: group.type }).from(group).where(eq(group.organisationYear, year)),
    database
      .select({ appointment: positionAppointment, name: user.name, banned: user.banned })
      .from(positionAppointment)
      .innerJoin(user, eq(user.id, positionAppointment.userId))
      .where(
        or(
          eq(positionAppointment.organisationYear, year),
          and(
            isNull(positionAppointment.organisationYear),
            or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, today))
          )
        )
      )
      .orderBy(asc(positionAppointment.startDate))
  ])
  return (Object.values(PositionCode) as PositionCode[])
    .filter((code) => code !== PositionCode.GigLeader)
    .flatMap((positionCode) => {
      const definition = POSITION_DEFINITIONS[positionCode]
      const organisationYear = definition.endPolicy === "annual" ? year : null
      const slot = (
        contextGroupId: string | null,
        choir: PositionSlot["choir"] = null,
        ownSection: PositionSlot["section"] = null
      ): PositionSlot => ({
        key: `${positionCode}:${contextGroupId ?? definition.context}`,
        positionCode,
        contextType: definition.context,
        contextGroupId,
        choir,
        section: ownSection,
        organisationYear,
        holders: appointments
          .filter(
            ({ appointment }) =>
              appointment.positionCode === positionCode &&
              appointment.contextGroupId === contextGroupId &&
              appointment.organisationYear === organisationYear
          )
          .map(({ appointment, name, banned }) => ({
            appointmentId: appointment.id,
            userId: appointment.userId,
            name,
            inactive: banned === true,
            startDate: appointment.startDate as IsoDate,
            endDate: appointment.endDate as IsoDate | null
          }))
      })
      if (definition.context === GroupType.Choir) return choirs.map(({ id, name }) => slot(id, { id, name }))
      if (definition.context === GroupType.Section)
        return choirs.flatMap(({ id, name, sections }) =>
          sections.map((own) => slot(own.id, { id, name }, { id: own.id, name: own.name }))
        )
      return [slot(annualGroups.find(({ type }) => type === definition.context)?.id ?? null)]
    })
}

/** The Positions whose holders belong to a Group of this type, in catalogue order. */
export function slotsGranting(slots: PositionSlot[], type: GroupType) {
  return slots.filter(({ positionCode }) =>
    (POSITION_DEFINITIONS[positionCode].grants as readonly GroupType[]).includes(type)
  )
}

/** The years an Admin can step through, oldest first: every set-up year, and always the current and next. */
export async function listOrganisationYears(database: OrgStructureDatabase, today: IsoDate): Promise<number[]> {
  const current = currentOrganisationYear(today)
  const rows = await database
    .selectDistinct({ year: group.organisationYear })
    .from(group)
    .where(isNotNull(group.organisationYear))
  return [...new Set([...rows.flatMap(({ year }) => (year === null ? [] : [year])), current, current + 1])]
    .filter((year) => year <= current + 1)
    .sort((a, b) => a - b)
}

export async function isYearSetUp(database: OrgStructureDatabase, year: number) {
  const [row] = await database.select({ id: group.id }).from(group).where(eq(group.organisationYear, year)).limit(1)
  return row !== undefined
}

export type RosterMember = {
  membershipId: string
  userId: string
  name: string
  voice: VoiceDivision | null
  voiceFamily: VoiceFamily | null
  choirs: { id: string; name: string }[]
  startDate: IsoDate
  endDate: IsoDate | null
}

export type Committee = {
  /** The Group type, or the Group's id for an Other Group. */
  key: string
  type: CommitteeType | GroupType.Other
  groupId: string | null
  name: string | null
  organisationYear: number | null
  members: RosterMember[]
}

/**
 * Every committee of a year with its independent members, then the ongoing Groups: continuing committees
 * and active Other Groups. A committee whose year is not set up is listed without a Group. Inactive Users
 * are left out, except in a finished year.
 */
export async function listCommittees(
  database: OrgStructureDatabase,
  year: number,
  today: IsoDate
): Promise<Committee[]> {
  const groups = await database
    .select()
    .from(group)
    .where(
      and(
        inArray(group.type, [...COMMITTEE_TYPES, GroupType.Other]),
        or(eq(group.organisationYear, year), and(isNull(group.organisationYear), eq(group.active, true)))
      )
    )
    .orderBy(asc(group.name))
  const finished = yearPhase(year, today) === "ended"
  const { endDate: yearEnd } = organisationYearPeriod(year)
  const members = await listRosterMembers(
    database,
    groups.map(({ id }) => id),
    finished ? shiftDate(yearEnd, -1) : today
  )
  const ofGroup = (id: string | null, annual: boolean) =>
    members.filter(
      (member) =>
        member.groupId === id &&
        (annual && finished ? true : !member.inactive && tenureStatus(member, today) !== "ended")
    )
  return [
    ...COMMITTEE_TYPES.map((type): Committee => {
      const annual = GROUP_POLICIES[type].lifetime === "annual"
      const row = groups.find((candidate) => candidate.type === type)
      return {
        key: type,
        type,
        groupId: row?.id ?? null,
        name: null,
        organisationYear: annual ? year : null,
        members: ofGroup(row?.id ?? null, annual)
      }
    }),
    ...groups
      .filter(({ type }) => type === GroupType.Other)
      .map(
        (row): Committee => ({
          key: row.id,
          type: GroupType.Other,
          groupId: row.id,
          name: row.name,
          organisationYear: null,
          members: ofGroup(row.id, false)
        })
      )
  ]
}

async function listRosterMembers(database: OrgStructureDatabase, groupIds: string[], choirsOn: IsoDate) {
  if (groupIds.length === 0) return []
  const rows = await database
    .select({ membership: directMembership, name: user.name, banned: user.banned })
    .from(directMembership)
    .innerJoin(user, eq(user.id, directMembership.userId))
    .where(inArray(directMembership.groupId, groupIds))
    .orderBy(asc(user.name), asc(directMembership.startDate))
  const userIds = [...new Set(rows.map(({ membership }) => membership.userId))]
  const choirs =
    userIds.length === 0
      ? []
      : await database
          .select({ userId: directMembership.userId, id: group.id, name: group.name })
          .from(directMembership)
          .innerJoin(group, eq(group.id, directMembership.groupId))
          .where(and(inArray(directMembership.userId, userIds), eq(group.type, GroupType.Choir), coversDate(choirsOn)))
          .orderBy(asc(group.name))
  return rows.map(({ membership, name, banned }) => ({
    groupId: membership.groupId,
    inactive: banned === true,
    membershipId: membership.id,
    userId: membership.userId,
    name,
    voice: membership.voice,
    voiceFamily: membership.voiceFamily,
    choirs: choirs
      .filter(({ userId }) => userId === membership.userId)
      .map((choir) => ({ id: choir.id, name: choir.name ?? "" })),
    startDate: membership.startDate as IsoDate,
    endDate: membership.endDate as IsoDate | null
  }))
}

/** A gig group's line-up now and as planned, with its Gigledare, or null when it is not a gig group. */
export async function getGigGroup(database: OrgStructureDatabase, groupId: string, today: IsoDate) {
  const [row] = await database
    .select()
    .from(group)
    .where(and(eq(group.id, groupId), eq(group.type, GroupType.GigGroup)))
  if (!row) return null
  const [members, leaders] = await Promise.all([
    listRosterMembers(database, [groupId], today),
    database
      .select({ appointment: positionAppointment, name: user.name, banned: user.banned })
      .from(positionAppointment)
      .innerJoin(user, eq(user.id, positionAppointment.userId))
      .where(
        and(
          eq(positionAppointment.contextGroupId, groupId),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, today))
        )
      )
      .orderBy(asc(positionAppointment.startDate))
  ])
  return {
    id: row.id,
    name: row.name ?? "",
    active: row.active,
    members: members.filter((member) => !member.inactive && tenureStatus(member, today) !== "ended"),
    leader: {
      key: `${PositionCode.GigLeader}:${row.id}`,
      positionCode: PositionCode.GigLeader,
      contextType: GroupType.GigGroup,
      contextGroupId: row.id,
      choir: null,
      section: null,
      organisationYear: null,
      holders: leaders.map(({ appointment, name, banned }) => ({
        appointmentId: appointment.id,
        userId: appointment.userId,
        name,
        inactive: banned === true,
        startDate: appointment.startDate as IsoDate,
        endDate: appointment.endDate as IsoDate | null
      }))
    } satisfies PositionSlot
  }
}

export type GigGroup = NonNullable<Awaited<ReturnType<typeof getGigGroup>>>

/** Every gig group, archived ones included, with today's members by Voice. */
export async function listGigGroups(database: OrgStructureDatabase, today: IsoDate) {
  const groups = await database
    .select({ id: group.id, name: group.name, active: group.active })
    .from(group)
    .where(eq(group.type, GroupType.GigGroup))
    .orderBy(asc(group.name))
  const members = await listRosterMembers(
    database,
    groups.map(({ id }) => id),
    today
  )
  return groups.map((row) => ({
    id: row.id,
    name: row.name ?? "",
    active: row.active,
    voices: members
      .filter((member) => member.groupId === row.id && !member.inactive && tenureStatus(member, today) === "current")
      .flatMap(({ voice }) => (voice ? [voice] : []))
  }))
}

/** Current and planned appointments that end with a singer's place in their Choir or Section. */
export async function listDependentAppointments(database: OrgStructureDatabase, today: IsoDate) {
  const rows = await database
    .select({
      userId: positionAppointment.userId,
      positionCode: positionAppointment.positionCode,
      contextGroupId: positionAppointment.contextGroupId,
      contextType: group.type,
      choirId: group.choirId
    })
    .from(positionAppointment)
    .innerJoin(group, eq(group.id, positionAppointment.contextGroupId))
    .where(
      and(
        inArray(group.type, [GroupType.Choir, GroupType.Section]),
        or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, today))
      )
    )
    .orderBy(desc(positionAppointment.startDate))
  return rows.filter(({ positionCode }) => POSITION_DEFINITIONS[positionCode].prerequisite)
}

export type DependentAppointment = Awaited<ReturnType<typeof listDependentAppointments>>[number]
