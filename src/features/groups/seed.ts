import "server-only"

import { and, eq } from "drizzle-orm"
import { group, position } from "@/core/db/schema/groups"
import type { GroupType, Voice } from "./model"
import type { GroupsDatabase } from "./operation"
import { allowPositionInGroupTypes, createChoir, createPosition } from "./structure"

/** CSK's three Choirs and their Sections, as placed in the Groups scheme. */
export const CHOIRS: { name: string; sections: { name: string; voices: Voice[] }[] }[] = [
  {
    name: "MK",
    sections: [
      { name: "MKT1", voices: ["T1"] },
      { name: "MKT2", voices: ["T2"] },
      { name: "MKB1", voices: ["B1"] },
      { name: "MKB2", voices: ["B2"] }
    ]
  },
  {
    name: "DK",
    sections: [
      { name: "DKS1", voices: ["S1"] },
      { name: "DKS2", voices: ["S2"] },
      { name: "DKA1", voices: ["A1"] },
      { name: "DKA2", voices: ["A2"] }
    ]
  },
  {
    name: "KK",
    sections: [
      { name: "KKS", voices: ["S1", "S2"] },
      { name: "KKA", voices: ["A1", "A2"] },
      { name: "KKT", voices: ["T1", "T2"] },
      { name: "KKB", voices: ["B1", "B2"] }
    ]
  }
]

/** The Positions CSK uses, and the GroupTypes each may be held in. */
export const POSITIONS: { name: string; groupTypes: GroupType[] }[] = [
  { name: "Ordförande", groupTypes: ["Board"] },
  { name: "PR-mästare", groupTypes: ["Board"] },
  { name: "Gigmästare", groupTypes: ["Board", "Gigmästeri"] },
  { name: "Sexmästare", groupTypes: ["Board", "Sexmästeri"] },
  { name: "Sexmästarinna", groupTypes: ["Board", "Sexmästeri"] },
  { name: "Conductor", groupTypes: ["Choir"] },
  { name: "Notfiskal", groupTypes: ["Choir"] },
  { name: "Konsertmästare", groupTypes: ["Choir"] },
  { name: "Stämförälder", groupTypes: ["Section"] }
]

/**
 * Creates the Choirs, their Sections and the Position catalogue. Safe to run again: anything that
 * already exists is left as it is.
 */
export async function seedGroups(database: GroupsDatabase) {
  const created: string[] = []

  for (const definition of CHOIRS) {
    const [existing] = await database
      .select({ id: group.id })
      .from(group)
      .where(and(eq(group.name, definition.name), eq(group.type, "Choir"), eq(group.active, true)))
    if (existing) continue

    const result = await createChoir(database, definition)
    if (!result.success) throw new Error(`Seeding Choir ${definition.name} failed: ${result.error}`)
    created.push(definition.name)
  }

  for (const definition of POSITIONS) {
    const [existing] = await database
      .select({ id: position.id })
      .from(position)
      .where(eq(position.name, definition.name))
    const result = existing
      ? await allowPositionInGroupTypes(database, existing.id, definition.groupTypes)
      : await createPosition(database, definition)
    if (!result.success) throw new Error(`Seeding Position ${definition.name} failed: ${result.error}`)
    if (!existing) created.push(definition.name)
  }

  return { created }
}
