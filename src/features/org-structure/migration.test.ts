import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq, sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { user } from "@/core/db/schema/auth"
import { group } from "@/core/db/schema/org-structure"
import { post, postRead } from "@/core/db/schema/posts"
import { GroupType } from "@/core/org-structure"
import { createTestDatabase } from "../../../test/database"

const folder = mkdtempSync(join(tmpdir(), "csk-before-organisation-redesign-"))
cpSync("drizzle", folder, { recursive: true })
const journal = JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8"))
const redesignIndex = journal.entries.findIndex(
  (entry: { tag: string }) => entry.tag === "0018_redesign-organisation-appointments"
)
if (redesignIndex < 0) throw new Error("Missing organisation redesign migration")
journal.entries = journal.entries.slice(0, redesignIndex)
writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal))
const database = await createTestDatabase(folder)

afterAll(async () => {
  await database?.drop()
  rmSync(folder, { recursive: true, force: true })
})

describe.skipIf(!database)("consolidated organisation migration", () => {
  test("upgrades master, preserves explicit identities and Post reads, and derives fixed labels", async () => {
    const { db } = database as NonNullable<typeof database>
    const userId = crypto.randomUUID()
    await db.insert(user).values({ id: userId, name: "Existing User", email: `${userId}@example.com` })
    const [announcement] = await db
      .insert(post)
      .values({ title: "Existing Post", body: { type: "doc", content: [] }, authorId: userId })
      .returning()
    if (!announcement) throw new Error("Missing Post fixture")
    await db.insert(postRead).values({ userId, postId: announcement.id })
    const reads = await db.select().from(postRead)
    const fixtures = await db.execute<{ id: string; name: string }>(sql`
      INSERT INTO "group" (name, type) VALUES ('MK', 'Choir'), ('Summer ensemble', 'GigGroup')
      RETURNING id, name
    `)
    const mk = fixtures.rows.find(({ name }) => name === "MK")
    const gig = fixtures.rows.find(({ name }) => name === "Summer ensemble")
    if (!mk || !gig) throw new Error("Missing Group fixtures")
    await db.execute(sql`INSERT INTO choir (group_id) VALUES (${mk.id})`)
    const team = await db.execute<{ id: string }>(sql`
      INSERT INTO "group" (name, type, choir_id) VALUES ('Old team label', 'Roddgrupp', ${mk.id}) RETURNING id
    `)

    await migrate(db, { migrationsFolder: "drizzle" })

    expect(await db.select().from(postRead)).toEqual(reads)
    expect(await db.select().from(post)).toEqual([announcement])
    expect(await db.select().from(group).where(eq(group.id, gig.id))).toMatchObject([gig])
    expect(await db.select().from(group).where(eq(group.id, mk.id))).toMatchObject([mk])
    expect(
      await db
        .select()
        .from(group)
        .where(eq(group.id, team.rows[0]?.id as string))
    ).toMatchObject([{ name: null, type: GroupType.EquipmentTeam, choirId: mk.id }])
    expect(
      await db.execute(sql`SELECT to_regclass('public.appointment_grant') AS grants,
        to_regprocedure('group_member_voice_check()') AS legacy_voice_function`)
    ).toMatchObject({ rows: [{ grants: null, legacy_voice_function: null }] })
    await expect(db.insert(group).values({ name: gig.name, type: GroupType.GigGroup }).execute()).rejects.toMatchObject(
      { cause: { constraint: "group_name_choir_active_unique" } }
    )
    await expect(
      db.insert(group).values({ type: GroupType.Board, organisationYear: 2027, active: false }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_annual_active_check" } })
    await expect(
      db.insert(group).values({ name: "Forged name", type: GroupType.Board, organisationYear: 2027 }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_name_policy_check" } })
    await expect(db.insert(group).values({ type: GroupType.GigGroup }).execute()).rejects.toMatchObject({
      cause: { constraint: "group_name_policy_check" }
    })
  })
})
