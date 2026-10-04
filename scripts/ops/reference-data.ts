import { Client, type ClientBase } from "pg"
import { secureConnection } from "@/core/db/tls"
import { confirmProductionWrite } from "./guards"
import { announce, type Database } from "./target"

/**
 * The org structure every environment shares: the three Choirs with their four Sections and the
 * Voice each sings, the Board, and the Position catalogue with the group types each is allowed in.
 */
export const REFERENCE_DATA: {
  choirs: { name: string; sections: { name: string; voice: string }[] }[]
  groups: { name: string; type: string }[]
  positions: { name: string; groupTypes: string[] }[]
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
  groups: [{ name: "Styret", type: "Board" }],
  positions: [
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
 * Insert the missing reference data in one transaction and return the names of what was created.
 * Existing active groups and Positions are matched by name and left as they are.
 */
export async function insertReferenceData(client: ClientBase): Promise<string[]> {
  const created: string[] = []
  await client.query("BEGIN")
  try {
    for (const choir of REFERENCE_DATA.choirs) {
      let choirId = await activeGroupId(client, choir.name, "Choir", null)
      if (!choirId) {
        choirId = await insertGroup(client, choir.name, "Choir", null)
        await client.query(`insert into "choir" ("group_id") values ($1)`, [choirId])
        created.push(choir.name)
      }
      for (const section of choir.sections) {
        if (await activeGroupId(client, section.name, "Section", choirId)) continue
        const sectionId = await insertGroup(client, section.name, "Section", choirId)
        await client.query(`insert into "section" ("group_id", "voice") values ($1, $2)`, [sectionId, section.voice])
        created.push(section.name)
      }
    }

    for (const group of REFERENCE_DATA.groups) {
      if (await activeGroupId(client, group.name, group.type, null)) continue
      await insertGroup(client, group.name, group.type, null)
      created.push(group.name)
    }

    for (const position of REFERENCE_DATA.positions) {
      const { rowCount } = await client.query(
        `insert into "position" ("name") values ($1) on conflict ("name") do nothing`,
        [position.name]
      )
      if (rowCount) created.push(position.name)
      for (const type of position.groupTypes) {
        await client.query(
          `insert into "group_type_position" ("type", "position_id")
           select $1, "id" from "position" where "name" = $2
           on conflict do nothing`,
          [type, position.name]
        )
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

async function insertGroup(client: ClientBase, name: string, type: string, choirId: string | null) {
  const { rows } = await client.query<{ id: string }>(
    `insert into "group" ("name", "type", "choir_id") values ($1, $2, $3) returning "id"`,
    [name, type, choirId]
  )
  const [row] = rows
  if (!row) throw new Error(`Creating the group ${name} did not return a record.`)
  return row.id
}
