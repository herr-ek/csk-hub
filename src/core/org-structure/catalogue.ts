import { GroupType, PositionCode } from "./identifiers"

type GroupPolicy = {
  scope: "csk" | "choir"
  lifetime: "annual" | "continuing" | "fluid"
  directMembership: "yes" | "helpers" | "placement" | "no"
  cardinality: "singleton" | "choir-singleton" | "multiple" | "existing-choirs" | "four-sections"
}

/** Fixed organisation policy; Arkivarie retains its existing database identifier. */
export const GROUP_POLICIES = {
  [GroupType.Choir]: { scope: "csk", lifetime: "continuing", directMembership: "yes", cardinality: "existing-choirs" },
  [GroupType.Section]: {
    scope: "choir",
    lifetime: "continuing",
    directMembership: "placement",
    cardinality: "four-sections"
  },
  [GroupType.Board]: { scope: "csk", lifetime: "annual", directMembership: "no", cardinality: "singleton" },
  [GroupType.GigCommittee]: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  [GroupType.SocialCommittee]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.ConcertCommittee]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.RecruitmentCommittee]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.TourCommittee]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.NominationCommittee]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "yes",
    cardinality: "singleton"
  },
  [GroupType.WebTeam]: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  [GroupType.Archives]: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  [GroupType.MemorisationCommittee]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "yes",
    cardinality: "singleton"
  },
  [GroupType.ParentsMeeting]: {
    scope: "csk",
    lifetime: "continuing",
    directMembership: "no",
    cardinality: "singleton"
  },
  [GroupType.EquipmentTeam]: {
    scope: "choir",
    lifetime: "fluid",
    directMembership: "yes",
    cardinality: "choir-singleton"
  },
  [GroupType.PartyTeam]: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  [GroupType.RehearsalWeekendTeam]: {
    scope: "choir",
    lifetime: "fluid",
    directMembership: "yes",
    cardinality: "choir-singleton"
  },
  [GroupType.GigGroup]: { scope: "csk", lifetime: "fluid", directMembership: "yes", cardinality: "multiple" },
  [GroupType.Other]: { scope: "csk", lifetime: "fluid", directMembership: "yes", cardinality: "multiple" }
} as const satisfies Record<GroupType, GroupPolicy>

type PositionDefinition = {
  context: GroupType
  prerequisite: boolean
  grants: readonly GroupType[]
  endPolicy: "annual" | "fluid"
}

/** Stable appointment identities, independent of display labels. */
export const POSITION_DEFINITIONS = {
  [PositionCode.Chair]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board],
    endPolicy: "annual"
  },
  [PositionCode.ViceChair]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.RecruitmentCommittee],
    endPolicy: "annual"
  },
  [PositionCode.Treasurer]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board],
    endPolicy: "annual"
  },
  [PositionCode.Secretary]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.ParentsMeeting],
    endPolicy: "annual"
  },
  [PositionCode.PublicRelationsOfficer]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board],
    endPolicy: "annual"
  },
  [PositionCode.FirstConcertMaster]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.ConcertCommittee],
    endPolicy: "annual"
  },
  [PositionCode.OrganisationGigCoordinator]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.GigCommittee],
    endPolicy: "annual"
  },
  [PositionCode.SocialCoordinator]: {
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.SocialCommittee],
    endPolicy: "annual"
  },
  [PositionCode.DeputySocialCoordinator]: {
    context: GroupType.SocialCommittee,
    prerequisite: false,
    grants: [GroupType.SocialCommittee],
    endPolicy: "annual"
  },
  [PositionCode.FinancialOfficer]: {
    context: GroupType.TourCommittee,
    prerequisite: false,
    grants: [GroupType.TourCommittee],
    endPolicy: "annual"
  },
  [PositionCode.Conductor]: {
    context: GroupType.Choir,
    prerequisite: true,
    grants: [],
    endPolicy: "fluid"
  },
  [PositionCode.MusicLibrarian]: {
    context: GroupType.Choir,
    prerequisite: true,
    grants: [],
    endPolicy: "fluid"
  },
  [PositionCode.ChoirConcertMaster]: {
    context: GroupType.Choir,
    prerequisite: true,
    grants: [GroupType.ConcertCommittee],
    endPolicy: "annual"
  },
  [PositionCode.ChoirGigCoordinator]: {
    context: GroupType.Choir,
    prerequisite: true,
    grants: [GroupType.GigCommittee],
    endPolicy: "annual"
  },
  [PositionCode.SectionParent]: {
    context: GroupType.Section,
    prerequisite: true,
    grants: [GroupType.ParentsMeeting],
    endPolicy: "fluid"
  },
  [PositionCode.GigLeader]: {
    context: GroupType.GigGroup,
    prerequisite: true,
    grants: [],
    endPolicy: "fluid"
  }
} as const satisfies Record<PositionCode, PositionDefinition>

/**
 * Exclusive calendar-date bounds; 26/27 is [2026-07-01, 2027-07-01).
 * Callers must supply an already validated integer year in 1000–9998; this formatter
 * performs no validation. Commands validate before constructing storage periods.
 */
export function organisationYearPeriod(year: number) {
  return { startDate: `${year}-07-01`, endDate: `${year + 1}-07-01` }
}
