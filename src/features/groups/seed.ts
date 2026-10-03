import "server-only"

import { and, eq, isNull, notExists, or } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { group, groupMember } from "@/core/db/schema/groups"
import { placeSinger } from "./membership"
import type { GroupType, Voice } from "./model"
import type { GroupsDatabase } from "./operation"
import { REFERENCE_DATA } from "./reference-data"
import { createGroup } from "./structure"

/** The remaining groups of the scheme's "Example placement", for local development only. */
const EXAMPLE_GROUPS: { name: string; type: Exclude<GroupType, "Choir" | "Section">; choir?: string }[] = [
  { name: "Gigmästeri", type: "Gigmästeri" },
  { name: "Sexmästeri", type: "Sexmästeri" },
  { name: "CSK konsertgrupp", type: "Konsert" },
  { name: "Jubileumskommittén", type: "Committee" },
  { name: "Giggrupp vår", type: "GigGroup" },
  ...REFERENCE_DATA.choirs.flatMap(({ name: choir }) => [
    { name: `${choir} konsertgrupp`, type: "Konsert" as const, choir },
    { name: `${choir} roddgrupp`, type: "Rodd" as const, choir },
    { name: `${choir} festgrupp`, type: "Fest" as const, choir },
    { name: `${choir} rephelgsgrupp`, type: "Rephelg" as const, choir }
  ])
]

const SEED_START_DATE = "2025-08-25"

/**
 * Local example data on top of the reference data the migrations create: the example groups,
 * and a Section for every active user who belongs to no group yet, dealt round the Choirs' Voices.
 * Safe to run again: existing groups and placed users are left as they are.
 */
export async function seedGroups(database: GroupsDatabase) {
  const created: string[] = []

  for (const example of EXAMPLE_GROUPS) {
    const choirId = example.choir ? await activeGroupId(database, example.choir, null) : null
    if (await activeGroupId(database, example.name, choirId)) continue

    const result = await createGroup(database, { name: example.name, type: example.type, choirId })
    if (!result.success) throw new Error(`Seeding group ${example.name} failed: ${result.error}`)
    created.push(example.name)
  }

  const slots: { choir: string; voice: Voice }[] = REFERENCE_DATA.choirs.flatMap(({ name, sections }) =>
    sections.flatMap(({ voices }) => voices.map((voice) => ({ choir: name, voice })))
  )
  const unplaced = await database
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        or(isNull(user.banned), eq(user.banned, false)),
        notExists(database.select().from(groupMember).where(eq(groupMember.userId, user.id)))
      )
    )
    .orderBy(user.createdAt)

  for (const [index, { id }] of unplaced.entries()) {
    const slot = slots[index % slots.length] as (typeof slots)[number]
    const choirId = await activeGroupId(database, slot.choir, null)
    if (!choirId) throw new Error(`Choir ${slot.choir} is missing; run the migrations first.`)
    const result = await placeSinger(database, { userId: id, choirId, voice: slot.voice, startDate: SEED_START_DATE })
    if (!result.success) throw new Error(`Placing a seeded singer failed: ${result.error}`)
  }

  return { created, placed: unplaced.length }
}

async function activeGroupId(database: GroupsDatabase, name: string, choirId: string | null) {
  const [row] = await database
    .select({ id: group.id })
    .from(group)
    .where(
      and(eq(group.name, name), eq(group.active, true), choirId ? eq(group.choirId, choirId) : isNull(group.choirId))
    )
  return row?.id
}
