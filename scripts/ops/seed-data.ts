import { createHash } from "node:crypto"
import type { db } from "@/core/db"
import { GroupType } from "@/core/org-structure"

export type SeedDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

const FIRST_NAMES = ["Alex", "Elin", "Hugo", "Linnea", "Noah", "Saga", "Viktor", "Wilma", "Sam", "Maja"]
const LAST_NAMES = ["Andersson", "Berg", "Dahl", "Ek", "Lind", "Nilsson", "Sjöberg", "Åström", "Holm", "Lund"]

export const SEED_PASSWORD = "password"
export const SEED_USERS = Array.from({ length: 100 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0")
  return {
    id: `csk-seed-singer-${number}`,
    email: `singer-${number}@example.com`,
    username: `singer${number}`,
    name: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length)]}`,
    role: index < 3 ? "admin" : "user",
    joined: `${2021 + (index % 5)}-08-25`
  }
})

/** Stable IDs let repeated local seeds add missing fixtures without duplicating archived groups or Posts. */
export function seedId(key: string): string {
  const hex = createHash("sha256").update(`csk-hub-demo:${key}`).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Stable identity keys for reference Groups whose display names admins may edit. */
export function referenceChoirId(name: "MK" | "DK" | "KK") {
  return seedId(`reference:choir:${name}`)
}

export function referenceSectionId(choir: "MK" | "DK" | "KK", section: string) {
  return seedId(`reference:section:${choir}:${section}`)
}

export function referenceContinuingGroupId(type: GroupType) {
  return seedId(`reference:continuing:${type}`)
}

/** The demo is a reproducible snapshot, separate from reference data's live year window. */
export const DEMO_ORGANISATION_YEAR = 2026
export const DEMO_AS_OF = "2026-10-22"

/** Individually named demo Groups retain their original stable IDs when their names are edited. */
export const DEMO_GIG_GROUP = {
  id: seedId("example-group:GigGroup:Giggrupp vår:csk"),
  name: "Giggrupp vår"
}
export const DEMO_PROJECT_GROUP = {
  id: seedId("example-group:Övrig:Jubileumskommittén:csk"),
  name: "Jubileumskommittén"
}

export type DemoChoir = "MK" | "DK" | "KK"
export type DemoChoirTeam = GroupType.EquipmentTeam | GroupType.PartyTeam | GroupType.RehearsalWeekendTeam

/** Immutable legacy seed tokens preserve existing UUIDs; these are never display names. */
const TEAM_ID_TOKENS: Record<DemoChoirTeam, string> = {
  [GroupType.EquipmentTeam]: "roddgrupp",
  [GroupType.PartyTeam]: "festgrupp",
  [GroupType.RehearsalWeekendTeam]: "rephelgsgrupp"
}

export function demoChoirTeamId(type: DemoChoirTeam, choir: DemoChoir) {
  return seedId(`example-group:${type}:${choir} ${TEAM_ID_TOKENS[type]}:${referenceChoirId(choir)}`)
}

export const DEMO_ARCHIVED_ORGANISATION_YEARS = [DEMO_ORGANISATION_YEAR - 2, DEMO_ORGANISATION_YEAR - 1] as const
export const DEMO_ARCHIVED_GIG_GROUP = {
  id: seedId("example-group:archived-gig-2025"),
  name: "Jubileumsensemblen"
}

/** Seven current ensembles plus one historical ensemble, each with fifteen singers. */
export const DEMO_GIG_GROUPS = [
  DEMO_GIG_GROUP,
  { id: seedId("example-group:gig:lunch"), name: "Lunchensemblen" },
  { id: seedId("example-group:gig:summer"), name: "Sommarensemblen" },
  { id: seedId("example-group:gig:autumn"), name: "Höstensemblen" },
  { id: seedId("example-group:gig:winter"), name: "Vinterensemblen" },
  { id: seedId("example-group:gig:events"), name: "Evenemangsensemblen" },
  { id: seedId("example-group:gig:chamber"), name: "Kammarensemblen" }
] as const
