import { afterAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { createTestDatabase } from "../../test/database"
import { readMigrations, statusOf } from "./migration-status"

const database = await createTestDatabase()

describe.skipIf(!database)("migration history upgrade", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  const target = { target: "local", url: t?.url, host: "test" } as const

  test("matches v1 migrations by name even when their timestamps differ", async () => {
    await t.db.execute(sql`update drizzle.__drizzle_migrations set created_at = 0`)
    const status = await statusOf(target)
    expect(status).toEqual({
      kind: "ok",
      host: "test",
      applied: readMigrations().map((entry) => entry.name),
      pending: []
    })
  })

  test("reads a legacy ledger without changing it, then upgrades without rerunning SQL", async () => {
    // These two 0.x entries shared a second. Their converted folder timestamps were
    // moved to preserve ordering; Drizzle must use SQL hashes to backfill both names.
    const document = "20261003210246_post-body-to-document"
    const search = "20261003210247_post-body-search"
    for (const entry of readMigrations()) {
      const when = entry.name === document ? 1791061365358 : entry.name === search ? 1791061365683 : entry.folderMillis
      await t.db.execute(sql`update drizzle.__drizzle_migrations set created_at = ${when} where name = ${entry.name}`)
    }
    await t.db.execute(sql`alter table drizzle.__drizzle_migrations drop column name, drop column applied_at`)

    const before = await statusOf(target)
    expect(before.kind).toBe("ok")
    if (before.kind !== "ok") throw new Error("Legacy ledger could not be read")
    expect(before.pending).toEqual([])
    expect(before.applied).toHaveLength(readMigrations().length)

    const { rows: columns } = await t.db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations' and column_name = 'name'
    `)
    expect(columns).toEqual([])

    await migrate(t.db, { migrationsFolder: "drizzle" })
    expect(await statusOf(target)).toEqual(before)
    const { rows } = await t.db.execute<{ name: string }>(
      sql`select name from drizzle.__drizzle_migrations order by name`
    )
    expect(rows.map((row) => row.name)).toEqual(readMigrations().map((entry) => entry.name))
  })

  test("reports an older migration missing by name even when its SQL hash still matches", async () => {
    const first = readMigrations()[0] as ReturnType<typeof readMigrations>[number]
    await t.db.execute(sql`update drizzle.__drizzle_migrations set name = 'missing' where name = ${first.name}`)
    const status = await statusOf(target)
    expect(status.kind).toBe("ok")
    if (status.kind !== "ok") throw new Error("Ledger could not be read")
    expect(status.pending).toEqual([first.name])
  })

  test("reports every migration pending when the ledger is absent", async () => {
    await t.db.execute(sql`drop schema drizzle cascade`)
    expect(await statusOf(target)).toEqual({
      kind: "ok",
      host: "test",
      applied: [],
      pending: readMigrations().map((entry) => entry.name)
    })
  })
})
