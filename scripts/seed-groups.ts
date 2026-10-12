#!/usr/bin/env bun
import { and, asc, count, eq, isNull, notExists, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, section } from "@/core/db/schema/org-structure"
import { voiceCapability } from "@/core/db/schema/voice"
import { assertLocalDatabase } from "./ops/guards"
import { SEED_USERS, type SeedDatabase } from "./ops/seed-data"
import { seedGroupActivity } from "./ops/seed-group-activity"

/**
 * Local example data on top of the reference data (`bun run ops reference-data`): the remaining
 * groups of the scheme's "Example placement", balanced singer placements, and demo Membership
 * and Position history. Scripts write directly, keeping the rules without importing features.
 *
 * It writes the tables directly, so scripts never depend on a feature. The rows it writes keep the
 * org-structure rules: a singer joins the Choir and one of its Sections, with a Voice the Section's
 * Voice contains.
 */

type Database = SeedDatabase
type Division = NonNullable<typeof groupMember.$inferInsert.voice>

const CHOIRS = ["MK", "DK", "KK"]

const EXAMPLE_GROUPS: { name: string; type: (typeof group.type.enumValues)[number]; choir?: string }[] = [
  { name: "Sexmästeri", type: "Sexmästeri" },
  { name: "Konsertmästeri", type: "Konsertmästeri" },
  { name: "Valberedningen", type: "Valberedning" },
  { name: "Jubileumskommittén", type: "Övrig" },
  { name: "Giggrupp vår", type: "GigGroup" },
  ...CHOIRS.flatMap((choir) => [
    { name: `${choir} roddgrupp`, type: "Roddgrupp" as const, choir },
    { name: `${choir} festgrupp`, type: "Festgrupp" as const, choir },
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
    const choirId = [...new Set(slots.map((slot) => slot.choirId))].sort(
      (a, b) =>
        slots.filter((slot) => slot.choirId === a).reduce((sum, slot) => sum + slot.members, 0) -
        slots.filter((slot) => slot.choirId === b).reduce((sum, slot) => sum + slot.members, 0)
    )[0]
    const slot = slots.filter((slot) => slot.choirId === choirId).sort((a, b) => a.members - b.members)[0]
    if (!slot) throw new Error("No Section is available.")
    const singer = SEED_USERS.find((singer) => singer.id === id)
    const startDate = singer?.joined ?? SEED_START_DATE
    const voice = slot.divisions[slot.members % slot.divisions.length] as Division
    const changed = singer && index % 5 === 0
    const previous =
      slot.divisions.length > 1
        ? slot
        : slots.find((other) => other.choirId === choirId && other.sectionId !== slot.sectionId)
    if (changed && previous) {
      await database.insert(groupMember).values({
        userId: id,
        groupId: previous.sectionId,
        startDate,
        endDate: "2026-02-01",
        voice: previous === slot ? slot.divisions.find((division) => division !== voice) : previous.divisions[0]
      })
    }
    await database.insert(groupMember).values([
      { userId: id, groupId: slot.choirId, startDate },
      { userId: id, groupId: slot.sectionId, startDate: changed ? "2026-02-01" : startDate, voice }
    ])
    if (singer && index % 7 !== 0) {
      const capabilities =
        index % 3 === 0 ? [voice, `${voice[0]}${voice.endsWith("1") ? "2" : "1"}` as Division] : [voice]
      await database
        .insert(voiceCapability)
        .values(capabilities.map((voice) => ({ userId: id, voice })))
        .onConflictDoNothing()
    }
    slot.members++
  }

  created.push(...(await seedGroupActivity(database)))
  return { created, placed: unplaced.length }
}

/**
 * One slot per Section, so KK's undivided Sections do not get twice MK/DK's singers.
 * Existing Section sizes keep successive runs balanced; KK alternates its two divisions.
 */
async function sectionSlots(database: Database) {
  const choirGroup = alias(group, "choir_group")
  const sections = await database
    .select({ choirId: choirGroup.id, sectionId: group.id, voice: section.voice })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .innerJoin(choirGroup, eq(choirGroup.id, group.choirId))
    .where(
      and(eq(group.active, true), eq(choirGroup.active, true), or(...CHOIRS.map((name) => eq(choirGroup.name, name))))
    )
    .orderBy(asc(choirGroup.name), asc(group.name))
  if (
    sections.length !== 12 ||
    new Set(sections.map(({ choirId }) => choirId)).size !== 3 ||
    sections.some(({ choirId }) => sections.filter((section) => section.choirId === choirId).length !== 4)
  ) {
    throw new Error("The three Choirs and their twelve Sections are required; run `bun run ops reference-data` first.")
  }
  const sizes = await database
    .select({ groupId: groupMember.groupId, members: count() })
    .from(groupMember)
    .where(isNull(groupMember.endDate))
    .groupBy(groupMember.groupId)
  return sections.map(({ choirId, sectionId, voice }) => ({
    choirId,
    sectionId,
    divisions: (voice.length === 1 ? [`${voice}1`, `${voice}2`] : [voice]) as Division[],
    members: sizes.find(({ groupId }) => groupId === sectionId)?.members ?? 0
  }))
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

  try {
    const { created, placed } = await seedGroups(db)
    console.log(created.length > 0 ? `Created groups: ${created.join(", ")}` : "Example groups already exist.")
    console.log(`Placed ${placed} user(s) in a Section; added missing demo group and Position history.`)
  } finally {
    await db.$client.end()
  }
}
