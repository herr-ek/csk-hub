import "server-only"

import { requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { COMMITTEE_TYPES, cskToday, currentOrganisationYear, GroupType } from "@/core/org-structure"
import { isUnplaced, isVacant, missingChoirs, missingFamilies, selectedYear } from "../roster"
import {
  type ChoirStructure,
  type Committee,
  getGigGroup,
  isYearSetUp,
  listChoirs,
  listCommittees,
  listDependentAppointments,
  listGigGroups,
  listOrganisationYears,
  listPeople,
  listPositionSlots,
  type PositionSlot,
  slotsGranting
} from "../roster-reads"

async function screenContext(requestedYear?: string) {
  await requirePermission({ action: "org.manage" })
  const today = cskToday()
  const [years, people] = await Promise.all([listOrganisationYears(db, today), listPeople(db, today)])
  const currentYear = currentOrganisationYear(today)
  const year = selectedYear(requestedYear, years, currentYear)
  return { today, years, people, currentYear, year, setUp: await isYearSetUp(db, year) }
}

/** The committees where a Position's new holder would stop being a Helper, by Position. */
function helperCommittees(slots: PositionSlot[], committees: Committee[]): HelperNotices {
  return Object.fromEntries(
    slots.map((slot) => [
      slot.key,
      COMMITTEE_TYPES.filter((type) => slotsGranting([slot], type).length > 0).flatMap((type) => {
        const helpers = committees.find(({ key }) => key === type)?.members ?? []
        return helpers.map(({ userId }) => ({ userId, type }))
      })
    ])
  )
}

/** Who would stop being a Helper, and where, by the key of the Position they would take. */
export type HelperNotices = Record<string, { userId: string; type: GroupType }[]>

export async function loadBoard(requestedYear?: string) {
  const context = await screenContext(requestedYear)
  const [slots, committees] = await Promise.all([
    listPositionSlots(db, context.year, context.today),
    listCommittees(db, context.year, context.today)
  ])
  const board = slots.filter(({ contextType }) => contextType === GroupType.Board)
  return { ...context, slots: board, helpers: helperCommittees(board, committees) }
}

export async function loadChoirPositions() {
  const context = await screenContext()
  const [choirs, slots, nextSlots, committees, nextCommittees] = await Promise.all([
    listChoirs(db),
    listPositionSlots(db, context.currentYear, context.today),
    listPositionSlots(db, context.currentYear + 1, context.today),
    listCommittees(db, context.currentYear, context.today),
    listCommittees(db, context.currentYear + 1, context.today)
  ])
  const inChoir = ({ contextType }: PositionSlot) => contextType === GroupType.Choir
  return {
    ...context,
    choirs,
    slots: slots.filter(inChoir),
    nextSlots: nextSlots.filter((slot) => inChoir(slot) && slot.organisationYear !== null),
    parents: slotsGranting(slots, GroupType.ParentsMeeting),
    helpers: helperCommittees(slots.filter(inChoir), committees),
    nextHelpers: helperCommittees(nextSlots.filter(inChoir), nextCommittees)
  }
}

/** What a committee is missing in a year: vacant Positions, then its own composition. */
export type CommitteeGaps = { vacant: number; families: string[]; choirs: string[] }

function committeeGaps(
  committee: Committee,
  slots: PositionSlot[],
  choirs: ChoirStructure[],
  today: string
): CommitteeGaps {
  return {
    vacant: slotsGranting(slots, committee.type).filter((slot) => isVacant(slot, today)).length,
    families: committee.type === GroupType.RecruitmentCommittee ? missingFamilies(committee.members) : [],
    choirs:
      committee.type === GroupType.NominationCommittee
        ? missingChoirs(choirs, committee.members).map(({ name }) => name)
        : []
  }
}

export async function loadCommittees(requestedYear?: string) {
  const context = await screenContext(requestedYear)
  const [committees, slots, choirs] = await Promise.all([
    listCommittees(db, context.year, context.today),
    listPositionSlots(db, context.year, context.today),
    listChoirs(db)
  ])
  return {
    ...context,
    choirs,
    committees: committees.map((committee) => ({
      ...committee,
      slots: slotsGranting(slots, committee.type),
      gaps: committeeGaps(committee, slots, choirs, context.today)
    })),
    helpers: helperCommittees(slots, committees)
  }
}

export async function loadChoirs() {
  await requirePermission({ action: "org.manage" })
  const today = cskToday()
  const [choirs, people, dependents] = await Promise.all([
    listChoirs(db),
    listPeople(db, today),
    listDependentAppointments(db, today)
  ])
  return { today, choirs, people, dependents }
}

export async function loadGigGroups() {
  await requirePermission({ action: "org.manage" })
  return listGigGroups(db, cskToday())
}

export async function loadGigGroup(groupId: string) {
  await requirePermission({ action: "org.manage" })
  const today = cskToday()
  const [gigGroup, people] = await Promise.all([getGigGroup(db, groupId, today), listPeople(db, today)])
  return gigGroup ? { gigGroup, people, today } : null
}

/** What needs attention this year, for the Admin overview. */
export async function getOrgAttention() {
  await requirePermission({ action: "org.manage" })
  const today = cskToday()
  const year = currentOrganisationYear(today)
  const [slots, committees, choirs, people] = await Promise.all([
    listPositionSlots(db, year, today),
    listCommittees(db, year, today),
    listChoirs(db),
    listPeople(db, today)
  ])
  const vacancies = (...types: GroupType[]) =>
    slots.filter((slot) => types.includes(slot.contextType) && isVacant(slot, today)).length
  const gaps = committees.map((committee) => committeeGaps(committee, slots, choirs, today))
  return {
    unplaced: people.filter(isUnplaced).length,
    board: vacancies(GroupType.Board),
    choirPositions: vacancies(GroupType.Choir, GroupType.Section),
    committees:
      vacancies(GroupType.SocialCommittee, GroupType.TourCommittee) +
      gaps.reduce((total, { families, choirs }) => total + families.length + choirs.length, 0)
  }
}
