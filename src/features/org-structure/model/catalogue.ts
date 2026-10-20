import type { GroupType } from "./index"

type GroupPolicy = {
  scope: "csk" | "choir"
  lifetime: "annual" | "continuing" | "fluid"
  directMembership: "yes" | "helpers" | "placement" | "no"
  cardinality: "singleton" | "choir-singleton" | "multiple" | "existing-choirs" | "four-sections"
}

/** Fixed organisation policy; Arkivarie retains its existing database identifier. */
export const GROUP_POLICIES = {
  Choir: { scope: "csk", lifetime: "continuing", directMembership: "yes", cardinality: "existing-choirs" },
  Section: { scope: "choir", lifetime: "continuing", directMembership: "placement", cardinality: "four-sections" },
  Board: { scope: "csk", lifetime: "annual", directMembership: "no", cardinality: "singleton" },
  Gigmästeri: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  Sexmästeri: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  Konsertmästeri: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  Rekryteringskommitté: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  Turnékommitté: { scope: "csk", lifetime: "annual", directMembership: "helpers", cardinality: "singleton" },
  Valberedning: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  Webmästeri: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  Arkivarie: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  Utantillkommitté: { scope: "csk", lifetime: "annual", directMembership: "yes", cardinality: "singleton" },
  Föräldramötet: { scope: "csk", lifetime: "continuing", directMembership: "no", cardinality: "singleton" },
  Roddgrupp: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  Festgrupp: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  Rephelg: { scope: "choir", lifetime: "fluid", directMembership: "yes", cardinality: "choir-singleton" },
  GigGroup: { scope: "csk", lifetime: "fluid", directMembership: "yes", cardinality: "multiple" },
  Övrig: { scope: "csk", lifetime: "fluid", directMembership: "yes", cardinality: "multiple" }
} as const satisfies Record<GroupType, GroupPolicy>

type PositionDefinition = {
  label: string
  context: GroupType
  prerequisite: boolean
  grants: readonly GroupType[]
  endPolicy: "annual" | "fluid"
}

/** Stable appointment identities, independent of the editable legacy catalogue and display labels. */
export const POSITION_DEFINITIONS = {
  ordforande: { label: "Ordförande", context: "Board", prerequisite: false, grants: ["Board"], endPolicy: "annual" },
  "vice-ordforande": {
    label: "Vice Ordförande",
    context: "Board",
    prerequisite: false,
    grants: ["Board", "Rekryteringskommitté"],
    endPolicy: "annual"
  },
  kassor: { label: "Kassör", context: "Board", prerequisite: false, grants: ["Board"], endPolicy: "annual" },
  sekreterare: {
    label: "Sekreterare",
    context: "Board",
    prerequisite: false,
    grants: ["Board", "Föräldramötet"],
    endPolicy: "annual"
  },
  "pr-mastare": { label: "PR-mästare", context: "Board", prerequisite: false, grants: ["Board"], endPolicy: "annual" },
  "forsta-konsertmastare": {
    label: "1:a Konsertmästare",
    context: "Board",
    prerequisite: false,
    grants: ["Board", "Konsertmästeri"],
    endPolicy: "annual"
  },
  "csk-gigmastare": {
    label: "CSK Gigmästare",
    context: "Board",
    prerequisite: false,
    grants: ["Board", "Gigmästeri"],
    endPolicy: "annual"
  },
  sexmastare: {
    label: "Sexmästare",
    context: "Board",
    prerequisite: false,
    grants: ["Board", "Sexmästeri"],
    endPolicy: "annual"
  },
  sexmastarinna: {
    label: "Sexmästarinna",
    context: "Sexmästeri",
    prerequisite: false,
    grants: ["Sexmästeri"],
    endPolicy: "annual"
  },
  "ekonomiskt-ansvarig": {
    label: "Ekonomiskt Ansvarig",
    context: "Turnékommitté",
    prerequisite: false,
    grants: ["Turnékommitté"],
    endPolicy: "annual"
  },
  dirigent: { label: "Dirigent", context: "Choir", prerequisite: true, grants: [], endPolicy: "fluid" },
  notfiskal: { label: "Notfiskal", context: "Choir", prerequisite: true, grants: [], endPolicy: "fluid" },
  "choir-konsertmastare": {
    label: "Choir Konsertmästare",
    context: "Choir",
    prerequisite: true,
    grants: ["Konsertmästeri"],
    endPolicy: "annual"
  },
  "choir-gigmastare": {
    label: "Choir Gigmästare",
    context: "Choir",
    prerequisite: true,
    grants: ["Gigmästeri"],
    endPolicy: "annual"
  },
  stamforalder: {
    label: "Stämförälder",
    context: "Section",
    prerequisite: true,
    grants: ["Föräldramötet"],
    endPolicy: "fluid"
  },
  gigledare: { label: "Gigledare", context: "GigGroup", prerequisite: true, grants: [], endPolicy: "fluid" }
} as const satisfies Record<string, PositionDefinition>

export type PositionCode = keyof typeof POSITION_DEFINITIONS

/**
 * Exclusive calendar-date bounds; 26/27 is [2026-07-01, 2027-07-01).
 * Callers must supply an already validated integer year in 1000–9998; this formatter
 * performs no validation. Commands validate before constructing storage periods.
 */
export function organisationYearPeriod(year: number) {
  return { startDate: `${year}-07-01`, endDate: `${year + 1}-07-01` }
}
