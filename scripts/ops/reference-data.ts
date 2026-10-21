import { Client, type ClientBase } from "pg"
import { secureConnection } from "@/core/db/tls"
import { confirmProductionWrite } from "./guards"
import { announce, type Database } from "./target"

/**
 * Fixed Groups every environment shares. Position rules live in the domain catalogue.
 */
export const REFERENCE_DATA: {
  choirs: { name: string; sections: { name: string; voice: string }[] }[]
  continuingGroups: { name: string; type: string }[]
  annualGroups(year: number): { name: string; type: string; year: number }[]
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
  continuingGroups: [{ name: "Föräldramötet", type: "Föräldramötet" }],
  annualGroups: (year) => {
    const label = `${String(year).slice(-2)}/${String(year + 1).slice(-2)}`
    return [
      ["Board", `Styret ${label}`],
      ["Gigmästeri", `Gigmästeriet ${label}`],
      ["Sexmästeri", `Sexmästeriet ${label}`],
      ["Konsertmästeri", `Konsertmästeriet ${label}`],
      ["Rekryteringskommitté", `Rekryteringskommittén ${label}`],
      ["Turnékommitté", `Turnékommittén ${label}`],
      ["Valberedning", `Valberedningen ${label}`],
      ["Webmästeri", `Webmästeriet ${label}`],
      ["Arkivarie", `Arkivet ${label}`],
      ["Utantillkommitté", `Utantillkommittén ${label}`]
    ].map(([type, name]) => ({ type: type as string, name: name as string, year }))
  }
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
 * Insert missing fixed Groups in one transaction and return the names of what was created.
 * Existing active Choirs/Sections and annual identities are retained.
 */
export async function insertReferenceData(client: ClientBase, currentYear = 2026): Promise<string[]> {
  const created: string[] = []
  await client.query("BEGIN")
  try {
    for (const choir of REFERENCE_DATA.choirs) {
      let choirId = await activeGroupId(client, choir.name, "Choir", null)
      if (!choirId) {
        choirId = await insertGroup(client, choir.name, "Choir", null, true)
        await client.query(`insert into "choir" ("group_id") values ($1)`, [choirId])
        created.push(choir.name)
      }
      for (const section of choir.sections) {
        if (await activeGroupId(client, section.name, "Section", choirId)) continue
        const sectionId = await insertGroup(client, section.name, "Section", choirId, true)
        await client.query(`insert into "section" ("group_id", "voice") values ($1, $2)`, [sectionId, section.voice])
        created.push(section.name)
      }
    }

    for (const definition of REFERENCE_DATA.continuingGroups) {
      if (await activeGroupId(client, definition.name, definition.type, null)) continue
      await insertGroup(client, definition.name, definition.type, null, true)
      created.push(definition.name)
    }
    for (const year of [currentYear, currentYear + 1]) {
      for (const definition of REFERENCE_DATA.annualGroups(year)) {
        if (await annualGroupId(client, definition.type, year)) continue
        await insertGroup(client, definition.name, definition.type, null, true, year)
        created.push(definition.name)
      }
    }

    await client.query("COMMIT")
    return created
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}

async function activeGroupId(client: ClientBase, name: string, type: string, choirId: string | null) {
  const { rows } = await client.query<{ id: string }>(
    `select "id" from "group"
     where "name" = $1 and "type" = $2 and "active" and "choir_id" is not distinct from $3::uuid`,
    [name, type, choirId]
  )
  return rows[0]?.id
}

async function annualGroupId(client: ClientBase, type: string, year: number) {
  const { rows } = await client.query<{ id: string }>(
    `select "id" from "group" where "type" = $1 and "organisation_year" = $2 and "uses_appointment_model"`,
    [type, year]
  )
  if (rows.length > 1) throw new Error(`More than one ${type} Group is marked for ${year}/${year + 1}.`)
  return rows[0]?.id
}

async function insertGroup(
  client: ClientBase,
  name: string,
  type: string,
  choirId: string | null,
  managed = false,
  year: number | null = null
) {
  const { rows } = await client.query<{ id: string }>(
    `insert into "group" ("name", "type", "choir_id", "uses_appointment_model", "organisation_year") values ($1, $2, $3, $4, $5) returning "id"`,
    [name, type, choirId, managed, year]
  )
  const [row] = rows
  if (!row) throw new Error(`Creating the group ${name} did not return a record.`)
  return row.id
}
