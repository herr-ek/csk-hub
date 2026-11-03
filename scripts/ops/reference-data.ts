import { Client, type ClientBase } from "pg"
import type { voice } from "@/core/db/schema/voice"
import { secureConnection } from "@/core/db/tls"
import { timeZone } from "@/core/i18n/time-zone"
import { currentOrganisationYear, GroupType, hasExplicitGroupName, sectionName } from "@/core/org-structure"
import { confirmProductionWrite } from "./guards"
import { referenceChoirId, referenceContinuingGroupId, referenceSectionId } from "./seed-data"
import { announce, type Database } from "./target"

type Voice = (typeof voice.enumValues)[number]

/**
 * Fixed Groups every environment shares. Position rules live in the domain catalogue.
 */
export const REFERENCE_DATA: {
  choirs: { name: string; sections: { voice: Voice }[] }[]
  continuingGroups: { type: GroupType }[]
  annualGroups(year: number): { type: GroupType; year: number }[]
} = {
  choirs: [
    {
      name: "MK",
      sections: [{ voice: "T1" }, { voice: "T2" }, { voice: "B1" }, { voice: "B2" }]
    },
    {
      name: "DK",
      sections: [{ voice: "S1" }, { voice: "S2" }, { voice: "A1" }, { voice: "A2" }]
    },
    {
      name: "KK",
      sections: [{ voice: "S" }, { voice: "A" }, { voice: "T" }, { voice: "B" }]
    }
  ],
  continuingGroups: [{ type: GroupType.ParentsMeeting }],
  annualGroups: (year) =>
    [
      GroupType.Board,
      GroupType.GigCommittee,
      GroupType.SocialCommittee,
      GroupType.ConcertCommittee,
      GroupType.RecruitmentCommittee,
      GroupType.TourCommittee,
      GroupType.NominationCommittee,
      GroupType.WebTeam,
      GroupType.Archives,
      GroupType.MemorisationCommittee
    ].map((type) => ({ type, year }))
}

/**
 * Create whatever of the reference data is missing. Allowed against prod, behind the usual
 * confirmation, since every environment needs the same structure. Safe to run again.
 *
 * Returns the exit code rather than exiting, so the interactive menu can stay open.
 */
export async function createReferenceData(
  database: Database,
  { skipConfirmation }: { skipConfirmation: boolean }
): Promise<number> {
  announce(database)

  if (!(await confirmProductionWrite("Create the reference data", database, { skip: skipConfirmation }))) return 1

  const client = new Client(secureConnection(database.url))

  try {
    await client.connect()
    const created = await insertReferenceData(client)
    console.log(
      created.length > 0
        ? `Created on ${database.host}: ${created.join(", ")}`
        : `The reference data already exists on ${database.host}.`
    )
    return 0
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * Insert missing fixed Groups in one transaction and return explicit names or stable type identifiers.
 * Defaults to the live organisational year and the following year; demos pass their snapshot year.
 * Existing active Choirs/Sections and annual identities are retained.
 */
export async function insertReferenceData(
  client: ClientBase,
  currentYear = currentOrganisationYear(new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date()))
): Promise<string[]> {
  const created: string[] = []
  await client.query("BEGIN")
  try {
    for (const choir of REFERENCE_DATA.choirs) {
      const choirSeedId = referenceChoirId(choir.name as "MK" | "DK" | "KK")
      let choirId = await seededGroupId(client, choirSeedId, GroupType.Choir, null)
      choirId ??= await activeGroupId(client, choir.name, GroupType.Choir, null)
      if (!choirId) {
        choirId = await insertGroup(client, choir.name, GroupType.Choir, null, null, choirSeedId)
        await client.query(`insert into "choir" ("group_id") values ($1)`, [choirId])
        created.push(choir.name)
      }
      const {
        rows: [currentChoir]
      } = await client.query<{ name: string }>(`SELECT name FROM "group" WHERE id = $1`, [choirId])
      if (!currentChoir) throw new Error("Reference Choir is missing.")
      for (const section of choir.sections) {
        const sectionSeedId = referenceSectionId(choir.name as "MK" | "DK" | "KK", section.voice)
        let sectionId = await seededGroupId(client, sectionSeedId, GroupType.Section, choirId)
        sectionId ??= await activeSectionId(client, choirId, section.voice)
        if (sectionId) continue
        sectionId = await insertGroup(client, null, GroupType.Section, choirId, null, sectionSeedId)
        await client.query(`insert into "section" ("group_id", "voice") values ($1, $2)`, [sectionId, section.voice])
        created.push(sectionName(currentChoir.name, section.voice))
      }
    }

    for (const definition of REFERENCE_DATA.continuingGroups) {
      const id = referenceContinuingGroupId(definition.type)
      const existingId = await seededGroupId(client, id, definition.type, null)
      if (existingId || (await activeGroupId(client, null, definition.type, null))) continue
      await insertGroup(client, null, definition.type, null, null, id)
      created.push(definition.type)
    }
    for (const year of [currentYear, currentYear + 1]) {
      for (const definition of REFERENCE_DATA.annualGroups(year)) {
        if (await annualGroupId(client, definition.type, year)) continue
        await insertGroup(client, null, definition.type, null, year)
        created.push(definition.type)
      }
    }

    await client.query("COMMIT")
    return created
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}

async function activeGroupId(client: ClientBase, name: string | null, type: GroupType, choirId: string | null) {
  const { rows } = await client.query<{ id: string }>(
    `select "id" from "group"
     where ($1::text IS NULL OR "name" = $1) and "type" = $2 and "active" and "choir_id" is not distinct from $3::uuid`,
    [hasExplicitGroupName(type) ? name : null, type, choirId]
  )
  return rows[0]?.id
}

async function seededGroupId(client: ClientBase, id: string, type: GroupType, choirId: string | null) {
  const { rows } = await client.query<{ id: string; type: GroupType; choir_id: string | null; active: boolean }>(
    `select "id", "type", "choir_id", "active" from "group" where "id" = $1`,
    [id]
  )
  const row = rows[0]
  if (!row) return undefined
  if (row.type !== type || row.choir_id !== choirId)
    throw new Error(`Reference Group identity ${id} has edited structural metadata; review it before seeding.`)
  if (!row.active) throw new Error(`Reference Group identity ${id} is archived; seeding will not recreate it.`)
  return row.id
}

async function annualGroupId(client: ClientBase, type: GroupType, year: number) {
  const { rows } = await client.query<{ id: string }>(
    `select "id" from "group" where "type" = $1 and "organisation_year" = $2`,
    [type, year]
  )
  if (rows.length > 1) throw new Error(`More than one ${type} Group is marked for ${year}/${year + 1}.`)
  return rows[0]?.id
}

async function insertGroup(
  client: ClientBase,
  name: string | null,
  type: GroupType,
  choirId: string | null,
  year: number | null = null,
  id?: string
) {
  const { rows } = id
    ? await client.query<{ id: string }>(
        `insert into "group" ("id", "name", "type", "choir_id", "organisation_year") values ($1, $2, $3, $4, $5) returning "id"`,
        [id, hasExplicitGroupName(type) ? name : null, type, choirId, year]
      )
    : await client.query<{ id: string }>(
        `insert into "group" ("name", "type", "choir_id", "organisation_year") values ($1, $2, $3, $4) returning "id"`,
        [hasExplicitGroupName(type) ? name : null, type, choirId, year]
      )
  const [row] = rows
  if (!row) throw new Error(`Creating the group ${name} did not return a record.`)
  return row.id
}

/** Match a Section's structural identity when it predates stable seed UUIDs. */
async function activeSectionId(client: ClientBase, choirId: string, voice: Voice) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT g.id FROM "group" g JOIN section s ON s.group_id = g.id
     WHERE g.type = 'Section' AND g.choir_id = $1 AND g.active AND s.voice = $2::voice`,
    [choirId, voice]
  )
  return rows[0]?.id
}
