import { and, asc, eq, isNull, notExists, or, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { alias } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import type { db as applicationDb } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import {
  choir,
  group,
  groupMember,
  groupTypePosition,
  position,
  positionGroup,
  section
} from "@/core/db/schema/org-structure"
import { isLocalDatabase, secureConnection } from "@/core/db/tls"
import { confirmProductionWrite } from "./guards"
import { announce, type Database } from "./target"

type SeedDatabase = typeof applicationDb
type Transaction = Parameters<Parameters<SeedDatabase["transaction"]>[0]>[0]
type GroupType = (typeof group.type.enumValues)[number]
type Division = NonNullable<typeof groupMember.$inferInsert.voice>
type Voice = (typeof section.voice.enumValues)[number]

/** The organisation structure shared by local and production databases. */
export const ORG_STRUCTURE: {
  choirs: { name: string; sections: { name: string; voice: Voice }[] }[]
  groups: { name: string; type: GroupType }[]
  positions: { name: string; groupTypes: GroupType[]; groups?: string[] }[]
} = {
  choirs: [
    {
      name: "MK",
      sections: [
        { name: "MKT1", voice: "T1" },
        { name: "MKT2", voice: "T2" },
        { name: "MKB1", voice: "B1" },
        { name: "MKB2", voice: "B2" }
      ]
    },
    {
      name: "DK",
      sections: [
        { name: "DKS1", voice: "S1" },
        { name: "DKS2", voice: "S2" },
        { name: "DKA1", voice: "A1" },
        { name: "DKA2", voice: "A2" }
      ]
    },
    {
      name: "KK",
      sections: [
        { name: "KKS", voice: "S" },
        { name: "KKA", voice: "A" },
        { name: "KKT", voice: "T" },
        { name: "KKB", voice: "B" }
      ]
    }
  ],
  groups: [
    { name: "Styret 25/26", type: "Board" },
    { name: "Gigmästeri", type: "Gigmästeri" }
  ],
  positions: [
    { name: "Ordförande", groupTypes: ["Board"] },
    { name: "Vice Ordförande", groupTypes: ["Board", "Rekryteringskommitté"] },
    { name: "Kassör", groupTypes: ["Board"] },
    { name: "Sekreterare", groupTypes: ["Board", "Föräldramötet"] },
    { name: "PR-mästare", groupTypes: ["Board"] },
    { name: "1:a Konsertmästare", groupTypes: ["Board", "Konsertmästeri"] },
    { name: "Gigmästare", groupTypes: ["Board", "Gigmästeri"] },
    { name: "Sexmästare", groupTypes: ["Board", "Sexmästeri"] },
    { name: "Sexmästarinna", groupTypes: ["Sexmästeri"] },
    { name: "Dirigent", groupTypes: ["Choir"] },
    { name: "Notfiskal", groupTypes: ["Choir"] },
    { name: "Konsertmästare", groupTypes: ["Choir", "Konsertmästeri"] },
    { name: "Gigmästare MK", groupTypes: ["Choir", "Gigmästeri"], groups: ["MK", "Gigmästeri"] },
    { name: "Gigmästare DK", groupTypes: ["Choir", "Gigmästeri"], groups: ["DK", "Gigmästeri"] },
    { name: "Gigmästare KK", groupTypes: ["Choir", "Gigmästeri"], groups: ["KK", "Gigmästeri"] },
    { name: "Stämförälder", groupTypes: ["Section", "Föräldramötet"] },
    { name: "Ekonomiskt Ansvarig", groupTypes: ["Turnékommitté"] }
  ]
}

const EXAMPLE_GROUPS: { name: string; type: GroupType; choir?: string }[] = [
  { name: "Sexmästeri", type: "Sexmästeri" },
  { name: "Konsertmästeri", type: "Konsertmästeri" },
  { name: "Valberedningen", type: "Valberedning" },
  { name: "Jubileumskommittén", type: "Övrig" },
  { name: "Giggrupp vår", type: "GigGroup" },
  ...ORG_STRUCTURE.choirs.flatMap(({ name: choir }) => [
    { name: `${choir} roddgrupp`, type: "Roddgrupp" as const, choir },
    { name: `${choir} festgrupp`, type: "Festgrupp" as const, choir },
    { name: `${choir} rephelgsgrupp`, type: "Rephelg" as const, choir }
  ])
]

const SEED_START_DATE = "2025-08-25"

/** One command owns the whole seed; example groups and automatic placement stay local-only. */
export async function seedOrgStructure(
  database: Database,
  { skipConfirmation }: { skipConfirmation: boolean }
): Promise<number> {
  if (database.target === "local" && !isLocalDatabase(database.url)) {
    console.error("✖ Seeding local organisation structure needs POSTGRES_URL to point at a local database.")
    return 1
  }
  announce(database)
  if (!(await confirmProductionWrite("Seed the organisation structure", database, { skip: skipConfirmation }))) return 1

  const pool = new Pool({ ...secureConnection(database.url), connectionTimeoutMillis: 5_000 })
  try {
    const { created, placed } = await populateOrgStructure(drizzle(pool), {
      localExamples: database.target === "local"
    })
    console.log(
      created.length > 0
        ? `Created on ${database.host}: ${created.join(", ")}`
        : `The organisation structure already exists on ${database.host}.`
    )
    if (database.target === "local") console.log(`Placed ${placed} user(s) in a Section.`)
    return 0
  } finally {
    await pool.end()
  }
}

/**
 * Seed a migrated database atomically. Existing groups, Positions and memberships are preserved.
 * Concurrent seed runs serialize in the database, including when started by separate processes.
 * The caller owns the connection; the ops entrypoint alone decides whether local examples apply.
 */
export function populateOrgStructure(database: SeedDatabase, { localExamples }: { localExamples: boolean }) {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('csk_hub:seed-org-structure'))`)
    const created: string[] = []
    const choirIds = new Map<string, string>()
    for (const definition of ORG_STRUCTURE.choirs) {
      let choirId = await activeGroupId(tx, definition.name, "Choir", null)
      if (!choirId) {
        choirId = await insertGroup(tx, definition.name, "Choir", null)
        await tx.insert(choir).values({ groupId: choirId })
        created.push(definition.name)
      }
      choirIds.set(definition.name, choirId)
      for (const definitionSection of definition.sections) {
        if (await activeGroupId(tx, definitionSection.name, "Section", choirId)) continue
        const sectionId = await insertGroup(tx, definitionSection.name, "Section", choirId)
        await tx.insert(section).values({ groupId: sectionId, voice: definitionSection.voice })
        created.push(definitionSection.name)
      }
    }
    for (const definition of ORG_STRUCTURE.groups) {
      if (await activeGroupId(tx, definition.name, definition.type, null)) continue
      await insertGroup(tx, definition.name, definition.type, null)
      created.push(definition.name)
    }
    for (const definition of ORG_STRUCTURE.positions) {
      const inserted = await tx.insert(position).values({ name: definition.name }).onConflictDoNothing().returning()
      if (inserted.length > 0) created.push(definition.name)
      const [row] =
        inserted.length > 0 ? inserted : await tx.select().from(position).where(eq(position.name, definition.name))
      if (!row) throw new Error(`Position ${definition.name} is missing.`)
      for (const type of definition.groupTypes) {
        await tx.insert(groupTypePosition).values({ type, positionId: row.id }).onConflictDoNothing()
      }
      for (const groupName of definition.groups ?? []) {
        const [limitedGroup] = await tx
          .select({ id: group.id })
          .from(group)
          .where(and(eq(group.name, groupName), eq(group.active, true), isNull(group.choirId)))
        if (!limitedGroup)
          throw new Error(`The Position ${definition.name} is limited to ${groupName}, which is not an active group.`)
        await tx.insert(positionGroup).values({ positionId: row.id, groupId: limitedGroup.id }).onConflictDoNothing()
      }
    }
    if (!localExamples) return { created, placed: 0 }

    for (const example of EXAMPLE_GROUPS) {
      const choirId = example.choir ? choirIds.get(example.choir) : null
      if (choirId === undefined) throw new Error(`Unknown Choir ${example.choir}.`)
      if (await activeGroupId(tx, example.name, example.type, choirId)) continue
      await insertGroup(tx, example.name, example.type, choirId)
      created.push(example.name)
    }

    const slots = await sectionSlots(tx)
    const unplaced = await tx
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          or(isNull(user.banned), eq(user.banned, false)),
          notExists(tx.select().from(groupMember).where(eq(groupMember.userId, user.id)))
        )
      )
      .orderBy(asc(user.createdAt), asc(user.id))

    for (const [index, { id }] of unplaced.entries()) {
      const slot = slots[index % slots.length] as (typeof slots)[number]
      await tx.insert(groupMember).values([
        { userId: id, groupId: slot.choirId, startDate: SEED_START_DATE },
        { userId: id, groupId: slot.sectionId, startDate: SEED_START_DATE, voice: slot.voice }
      ])
    }
    return { created, placed: unplaced.length }
  })
}

/** A family Section, such as KKB, deals its divisions so every local singer gets one division. */
async function sectionSlots(database: Transaction) {
  const choirGroup = alias(group, "choir_group")
  const sections = await database
    .select({ choirId: choirGroup.id, sectionId: group.id, voice: section.voice })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .innerJoin(choirGroup, eq(choirGroup.id, group.choirId))
    .where(and(eq(group.active, true), eq(choirGroup.active, true)))
    .orderBy(asc(choirGroup.name), asc(group.name))
  if (sections.length === 0) throw new Error("The organisation structure has no active Sections.")
  return sections.flatMap(({ choirId, sectionId, voice }) =>
    ((voice.length === 1 ? [`${voice}1`, `${voice}2`] : [voice]) as Division[]).map((division) => ({
      choirId,
      sectionId,
      voice: division
    }))
  )
}

async function activeGroupId(database: Transaction, name: string, type: GroupType, choirId: string | null) {
  const [row] = await database
    .select({ id: group.id, type: group.type })
    .from(group)
    .where(
      and(eq(group.name, name), eq(group.active, true), choirId ? eq(group.choirId, choirId) : isNull(group.choirId))
    )
  if (row && row.type !== type) throw new Error(`Group ${name} has type ${row.type}; expected ${type}.`)
  return row?.id
}

async function insertGroup(database: Transaction, name: string, type: GroupType, choirId: string | null) {
  const [row] = await database.insert(group).values({ name, type, choirId }).returning({ id: group.id })
  if (!row) throw new Error(`Creating the group ${name} did not return a record.`)
  return row.id
}
