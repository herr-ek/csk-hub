import { createHash } from "node:crypto"
import type { db } from "@/core/db"

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

export function referenceContinuingGroupId(type: string) {
  return seedId(`reference:continuing:${type}`)
}
