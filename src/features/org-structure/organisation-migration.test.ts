import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTestDatabase } from "@test/database"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { inventoryOrganisation } from "./reconciliation"

// The fixture really runs the historical ledger first, rather than inserting legacy-shaped
// rows into the expanded schema. No development database or committed migration is changed.
async function prepareLegacyDatabase() {
  const folder = await mkdtemp(join(tmpdir(), "csk-org-migrations-"))
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"))
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 17)
  await mkdir(join(folder, "meta"))
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(journal))
  for (const entry of journal.entries) await copyFile(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`))
  const database = await createTestDatabase(folder)
  return { folder, database }
}
const { folder, database } = await prepareLegacyDatabase()
if (!database) await rm(folder, { recursive: true, force: true })

describe.skipIf(!database)("organisation migration", () => {
  afterAll(async () => {
    await database?.drop()
    await rm(folder, { recursive: true, force: true })
  })
  test("expands populated legacy tables while preserving IDs, zero-length history, Voice triggers and Event references", async () => {
    if (!database) throw new Error("Missing test database")
    await database.db.execute(sql`
        INSERT INTO "user" (id, name, email) VALUES ('legacy-singer', 'Legacy singer', 'legacy@example.com');
        INSERT INTO "group" (id, name, type) VALUES ('00000000-0000-4000-8000-000000000001', 'Styret 26/27', 'Board');
        INSERT INTO position (id, name) VALUES ('00000000-0000-4000-8000-000000000002', 'Ordförande');
        INSERT INTO group_type_position (type, position_id) VALUES ('Board', '00000000-0000-4000-8000-000000000002');
        INSERT INTO group_member (user_id, group_id, start_date, end_date) VALUES
          ('legacy-singer', '00000000-0000-4000-8000-000000000001', '2026-07-01', '2026-07-01');
        INSERT INTO position_holder (user_id, group_id, position_id, start_date) VALUES
          ('legacy-singer', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2026-07-01');
        INSERT INTO event (type, title, starts_at, ends_at, participation_mode, organiser_group_id) VALUES
          ('Meeting', 'Legacy Board meeting', '2026-10-01', '2026-10-02', 'None', '00000000-0000-4000-8000-000000000001');
      `)
    const before = await database.db.execute(sql`SELECT * FROM position_holder`)
    await migrate(database.db, { migrationsFolder: "drizzle" })
    expect((await database.db.execute(sql`SELECT * FROM position_holder`)).rows).toEqual(before.rows)
    expect((await database.db.execute(sql`SELECT organiser_group_id FROM event`)).rows).toEqual([
      { organiser_group_id: "00000000-0000-4000-8000-000000000001" }
    ])
    expect(
      (await database.db.execute(sql`SELECT organisation_year, uses_appointment_model FROM "group"`)).rows
    ).toEqual([{ organisation_year: null, uses_appointment_model: false }])
    expect((await database.db.execute(sql`SELECT count(*)::int AS count FROM position_appointment`)).rows).toEqual([
      { count: 0 }
    ])
    const report = await database.db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`)
      return inventoryOrganisation(tx)
    })
    expect(report.conflictingMemberships).toContainEqual(
      expect.objectContaining({ userId: "legacy-singer", reason: "empty-or-reversed-period" })
    )
    await expect(
      database.db
        .execute(
          sql`INSERT INTO group_member (user_id, group_id, start_date, voice) VALUES ('legacy-singer', '00000000-0000-4000-8000-000000000001', '2027-01-01', 'B1')`
        )
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_section_check" } })
    const command = spawnSync("bun", ["run", "ops", "organisation-inventory"], {
      env: { ...process.env, POSTGRES_URL: database.url },
      encoding: "utf8"
    })
    expect(command.status).toBe(0)
    expect(JSON.parse(command.stdout).holdingEvidence).toHaveLength(1)
    await migrate(database.db, { migrationsFolder: "drizzle" })
    expect((await database.db.execute(sql`SELECT * FROM position_holder`)).rows).toEqual(before.rows)
  })
})
