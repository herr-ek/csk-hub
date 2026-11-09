import { afterAll, describe, expect, test } from "bun:test"
import { Client } from "pg"
import { group } from "@/core/db/schema/org-structure"
import { createTestDatabase } from "../../test/database"
import { deploy } from "./deploy"
import { statusOf } from "./migration-status"
import { REFERENCE_DATA } from "./reference-data"
import type { Database } from "./target"

const database = await createTestDatabase()

describe.skipIf(!database)("deploy", () => {
  const t = database as NonNullable<typeof database>
  const target: Database = { target: "local", url: t.url, host: "test" }
  afterAll(() => t.drop())

  test("migrates an empty database and creates the reference data, then does nothing again", async () => {
    // Start from nothing, as a fresh stack's database does.
    const client = new Client({ connectionString: t.url })
    await client.connect()
    await client.query(`DROP SCHEMA "drizzle" CASCADE`)
    await client.query(`DROP SCHEMA "public" CASCADE`)
    await client.query(`CREATE SCHEMA "public"`)
    await client.end()

    expect(await deploy(target)).toBe(0)
    const status = await statusOf(target)
    expect(status.kind === "ok" && status.pending).toEqual([])
    const groups = await t.db.select({ name: group.name }).from(group)
    expect(groups.map(({ name }) => name)).toEqual(
      expect.arrayContaining(REFERENCE_DATA.choirs.map(({ name }) => name))
    )

    expect(await deploy(target)).toBe(0)
    expect(await t.db.select({ name: group.name }).from(group)).toHaveLength(groups.length)
  })
})
