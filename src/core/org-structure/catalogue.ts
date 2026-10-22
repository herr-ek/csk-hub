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
  [GroupType.Gigmästeri]: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  [GroupType.Sexmästeri]: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  [GroupType.Konsertmästeri]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.Rekryteringskommitté]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.Turnékommitté]: {
    scope: "csk",
    lifetime: "annual",
    directMembership: "helpers",
    cardinality: "singleton"
  },
  [GroupType.Valberedning]: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  [GroupType.Webmästeri]: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  [GroupType.Arkivarie]: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  [GroupType.Utantillkommitté]: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  [GroupType.Föräldramötet]: { scope: "csk", lifetime: "continuing", directMembership: "no", cardinality: "singleton" },
  [GroupType.Roddgrupp]: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  [GroupType.Festgrupp]: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  [GroupType.Rephelg]: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  [GroupType.GigGroup]: { scope: "csk", lifetime: "fluid", directMembership: "yes", cardinality: "multiple" },
  [GroupType.Övrig]: { scope: "csk", lifetime: "fluid", directMembership: "yes", cardinality: "multiple" }
} as const satisfies Record<GroupType, GroupPolicy>

type PositionDefinition = {
  label: string
  context: GroupType
  prerequisite: boolean
  grants: readonly GroupType[]
  endPolicy: "annual" | "fluid"
}

/** Stable appointment identities, independent of display labels. */
export const POSITION_DEFINITIONS = {
  [PositionCode.Ordforande]: {
    label: "Ordförande",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board],
    endPolicy: "annual"
  },
  [PositionCode.ViceOrdforande]: {
    label: "Vice Ordförande",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.Rekryteringskommitté],
    endPolicy: "annual"
  },
  [PositionCode.Kassor]: {
    label: "Kassör",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board],
    endPolicy: "annual"
  },
  [PositionCode.Sekreterare]: {
    label: "Sekreterare",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.Föräldramötet],
    endPolicy: "annual"
  },
  [PositionCode.PrMastare]: {
    label: "PR-mästare",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board],
    endPolicy: "annual"
  },
  [PositionCode.ForstaKonsertmastare]: {
    label: "1:a Konsertmästare",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.Konsertmästeri],
    endPolicy: "annual"
  },
  [PositionCode.CskGigmastare]: {
    label: "CSK Gigmästare",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.Gigmästeri],
    endPolicy: "annual"
  },
  [PositionCode.Sexmastare]: {
    label: "Sexmästare",
    context: GroupType.Board,
    prerequisite: false,
    grants: [GroupType.Board, GroupType.Sexmästeri],
    endPolicy: "annual"
  },
  [PositionCode.Sexmastarinna]: {
    label: "Sexmästarinna",
    context: GroupType.Sexmästeri,
    prerequisite: false,
    grants: [GroupType.Sexmästeri],
    endPolicy: "annual"
  },
  [PositionCode.EkonomisktAnsvarig]: {
    label: "Ekonomiskt Ansvarig",
    context: GroupType.Turnékommitté,
    prerequisite: false,
    grants: [GroupType.Turnékommitté],
    endPolicy: "annual"
  },
  [PositionCode.Dirigent]: {
    label: "Dirigent",
    context: GroupType.Choir,
    prerequisite: true,
    grants: [],
    endPolicy: "fluid"
  },
  [PositionCode.Notfiskal]: {
    label: "Notfiskal",
    context: GroupType.Choir,
    prerequisite: true,
    grants: [],
    endPolicy: "fluid"
  },
  [PositionCode.ChoirKonsertmastare]: {
    label: "Choir Konsertmästare",
    context: GroupType.Choir,
    prerequisite: true,
    grants: [GroupType.Konsertmästeri],
    endPolicy: "annual"
  },
  [PositionCode.ChoirGigmastare]: {
    label: "Choir Gigmästare",
    context: GroupType.Choir,
    prerequisite: true,
    grants: [GroupType.Gigmästeri],
    endPolicy: "annual"
  },
  [PositionCode.Stamforalder]: {
    label: "Stämförälder",
    context: GroupType.Section,
    prerequisite: true,
    grants: [GroupType.Föräldramötet],
    endPolicy: "fluid"
  },
  [PositionCode.Gigledare]: {
    label: "Gigledare",
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
