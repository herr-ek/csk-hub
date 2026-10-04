#!/usr/bin/env bun
import { and, asc, eq, isNull, notExists, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { db as applicationDb } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, section } from "@/core/db/schema/org-structure"
import { assertLocalDatabase } from "./ops/guards"

/**
 * Local example data on top of the reference data (`bun run ops reference-data`): the remaining
 * groups of the scheme's "Example placement", and a Section for every active user who belongs to no
 * group yet, dealt round the Choirs' Voices.
 *
 * It writes the tables directly, so scripts never depend on a feature. The rows it writes keep the
 * org-structure rules: a singer joins the Choir and one of its Sections, with a Voice the Section's
 * Voice contains.
 */

type Database = typeof applicationDb | Parameters<Parameters<typeof applicationDb.transaction>[0]>[0]

const CHOIRS = ["MK", "DK", "KK"]

const EXAMPLE_GROUPS: { name: string; type: (typeof group.type.enumValues)[number]; choir?: string }[] = [
  { name: "Gigmästeri", type: "Gigmästeri" },
  { name: "Sexmästeri", type: "Sexmästeri" },
  { name: "CSK konsertgrupp", type: "Konsert" },
  { name: "Jubileumskommittén", type: "Committee" },
  { name: "Giggrupp vår", type: "GigGroup" },
  ...CHOIRS.flatMap((choir) => [
    { name: `${choir} konsertgrupp`, type: "Konsert" as const, choir },
    { name: `${choir} roddgrupp`, type: "Rodd" as const, choir },
    { name: `${choir} festgrupp`, type: "Fest" as const, choir },
    { name: `${choir} rephelgsgrupp`, type: "Rephelg" as const, choir }
  ])
]

const SEED_START_DATE = "2025-08-25"

/**
 * Safe to run again: existing groups and placed users are left as they are. One transaction, so a
 * refused run, such as one before the reference data exists, leaves nothing behind.
 */
export function seedGroups(database: Database) {
  return database.transaction(async (tx) => seed(tx))
}

async function seed(database: Database) {
  const slots = await sectionSlots(database)
  const created: string[] = []

  for (const example of EXAMPLE_GROUPS) {
    const choirId = example.choir ? await requireChoir(database, example.choir) : null
    if (await activeGroupId(database, example.name, choirId)) continue
    await database.insert(group).values({ name: example.name, type: example.type, choirId })
    created.push(example.name)
  }

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
    await database.insert(groupMember).values([
      { userId: id, groupId: slot.choirId, startDate: SEED_START_DATE },
      { userId: id, groupId: slot.sectionId, startDate: SEED_START_DATE, voice: slot.voice }
    ])
  }

  return { created, placed: unplaced.length }
}

/**
 * One slot per Voice a singer can be placed with, in Choir and Section order. A Section singing a
 * whole family, as KKB sings B, deals its divisions, so seeded singers get B1 or B2.
 */
async function sectionSlots(database: Database) {
  const choirGroup = alias(group, "choir_group")
  const sections = await database
    .select({ choirId: choirGroup.id, sectionId: group.id, voice: section.voice })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .innerJoin(choirGroup, eq(choirGroup.id, group.choirId))
    .where(and(eq(group.active, true), eq(choirGroup.active, true)))
    .orderBy(asc(choirGroup.name), asc(group.name))
  if (sections.length === 0) throw new Error("No Sections exist; run `bun run ops reference-data` first.")

  return sections.flatMap(({ choirId, sectionId, voice }) =>
    (voice.length === 1 ? ([`${voice}1`, `${voice}2`] as (typeof voice)[]) : [voice]).map((division) => ({
      choirId,
      sectionId,
      voice: division
    }))
  )
}

async function requireChoir(database: Database, name: string) {
  const id = await activeGroupId(database, name, null)
  if (!id) throw new Error(`Choir ${name} is missing; run \`bun run ops reference-data\` first.`)
  return id
}

async function activeGroupId(database: Database, name: string, choirId: string | null) {
  const [row] = await database
    .select({ id: group.id })
    .from(group)
    .where(
      and(eq(group.name, name), eq(group.active, true), choirId ? eq(group.choirId, choirId) : isNull(group.choirId))
    )
  return row?.id
}

if (import.meta.main) {
  assertLocalDatabase("Seeding groups")
  const { db } = await import("@/core/db")

  const { created, placed } = await seedGroups(db)
  await db.$client.end()

  console.log(created.length > 0 ? `Created groups: ${created.join(", ")}` : "Example groups already exist.")
  console.log(`Placed ${placed} user(s) in a Section.`)
}
