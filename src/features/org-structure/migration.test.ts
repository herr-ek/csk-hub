import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import { user } from "@/core/db/schema/auth"
import { group, section } from "@/core/db/schema/org-structure"
import { post, postRead } from "@/core/db/schema/posts"
import { GROUP_POLICIES, GroupType } from "@/core/org-structure"
import { insertReferenceData } from "../../../scripts/ops/reference-data"
import { createTestDatabase } from "../../../test/database"

const folder = mkdtempSync(join(tmpdir(), "csk-before-organisation-redesign-"))
cpSync("drizzle", folder, { recursive: true })
const redesignFolder = readdirSync(folder).find((name) => name.endsWith("_redesign-organisation-appointments"))
if (!redesignFolder) throw new Error("Missing organisation redesign migration")
for (const name of readdirSync(folder)) {
  if (name >= redesignFolder) rmSync(join(folder, name), { recursive: true })
}
const database = await createTestDatabase(folder)

afterAll(async () => {
  await database?.drop()
  rmSync(folder, { recursive: true, force: true })
})

describe.skipIf(!database)("consolidated organisation migration", () => {
  test.each(["Board", "Gigmästeri", "Choir"])(
    "refuses a retained %s before changing schema, data or the migration ledger",
    async (type) => {
      const legacy = await createTestDatabase(folder)
      if (!legacy) throw new Error("Expected a local test database")
      const { db } = legacy
      try {
        const userId = crypto.randomUUID()
        await db.insert(user).values({ id: userId, name: "Existing User", email: `${userId}@example.com` })
        const groups = await db.execute<{ id: string }>(sql`
          INSERT INTO "group" (name, type) VALUES (${type === "Board" ? "Styret 25/26" : type}, ${type}::group_type)
          RETURNING id
        `)
        const groupId = groups.rows[0]?.id
        if (!groupId) throw new Error("Missing legacy Group")
        if (type === "Choir") await db.execute(sql`INSERT INTO choir (group_id) VALUES (${groupId})`)
        const positions = await db.execute<{ id: string }>(sql`
          INSERT INTO position (name) VALUES ('Existing responsibility') RETURNING id
        `)
        const positionId = positions.rows[0]?.id
        if (!positionId) throw new Error("Missing legacy Position")
        await db.execute(sql`INSERT INTO group_member (user_id, group_id, start_date)
          VALUES (${userId}, ${groupId}, '2025-07-01')`)
        await db.execute(sql`INSERT INTO position_holder (user_id, group_id, position_id, start_date)
          VALUES (${userId}, ${groupId}, ${positionId}, '2025-07-01')`)
        await db.execute(sql`INSERT INTO event (type, title, starts_at, ends_at, participation_mode, organiser_group_id)
          VALUES ('Meeting', 'Retained Event', '2026-11-01 17:00Z', '2026-11-01 18:00Z', 'None', ${groupId})`)

        // Capture raw old-schema rows; the new Drizzle Group projection already expects a year column.
        const before = await legacyState(db)
        await expect(migrate(db, { migrationsFolder: "drizzle" })).rejects.toMatchObject({
          cause: {
            message: "Organisation redesign requires an empty Group table; see scripts/ops/README.md (PR #130)."
          }
        })
        expect(await legacyState(db)).toEqual(before)
        expect(
          await db.execute(sql`SELECT to_regclass('public.direct_membership') AS direct,
          to_regclass('public.position_appointment') AS appointments,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
            AND table_name = 'group' AND column_name = 'organisation_year') AS year_column`)
        ).toMatchObject({ rows: [{ direct: null, appointments: null, year_column: false }] })
      } finally {
        await legacy.drop()
      }
    }
  )

  test("migrates an empty organisation, retains unrelated data and reseeds valid Group identities", async () => {
    const { db, url } = database as NonNullable<typeof database>
    const userId = crypto.randomUUID()
    await db.insert(user).values({ id: userId, name: "Existing User", email: `${userId}@example.com` })
    const {
      rows: [announcement]
    } = await db.execute<{ id: string; title: string; body: unknown; authorId: string }>(sql`
      INSERT INTO post (title, body, author_id)
      VALUES ('Existing Post', '{"type":"doc","content":[]}'::jsonb, ${userId})
      RETURNING id, title, body, author_id AS "authorId"
    `)
    if (!announcement) throw new Error("Missing Post fixture")
    await db.insert(postRead).values({ userId, postId: announcement.id })
    const users = await db.select().from(user)
    const reads = await db.select().from(postRead)

    await migrate(db, { migrationsFolder: "drizzle" })

    expect(await db.select().from(group)).toEqual([])
    expect(await db.select().from(user)).toEqual(users)
    expect(await db.select().from(postRead)).toEqual(reads)
    expect(await db.select().from(post)).toMatchObject([{ ...announcement, audienceAll: true, publisherGroupId: null }])
    expect(
      await db.execute(sql`SELECT to_regclass('public.group_member') AS legacy_memberships,
      to_regclass('public.position_holder') AS legacy_holdings,
      to_regclass('public.position') AS legacy_positions,
      to_regclass('public.direct_membership') AS direct,
      to_regclass('public.position_appointment') AS appointments`)
    ).toMatchObject({
      rows: [
        {
          legacy_memberships: null,
          legacy_holdings: null,
          legacy_positions: null,
          direct: "direct_membership",
          appointments: "position_appointment"
        }
      ]
    })

    const client = new Client({ connectionString: url })
    await client.connect()
    try {
      expect((await insertReferenceData(client, 2026)).length).toBeGreaterThan(0)
      expect(await insertReferenceData(client, 2026)).toEqual([])
    } finally {
      await client.end()
    }
    const groups = await db.select().from(group)
    const annual = groups.filter(({ type }) => GROUP_POLICIES[type].lifetime === "annual")
    expect(annual).toHaveLength(18)
    expect(annual.every(({ organisationYear }) => organisationYear === 2026 || organisationYear === 2027)).toBe(true)
    expect(await db.select().from(section)).toHaveLength(12)
    expect(groups.filter(({ type }) => type === GroupType.Choir)).toHaveLength(3)
    expect(groups.filter(({ type }) => type === GroupType.ParentsMeeting)).toHaveLength(1)
    expect(groups.filter(({ type }) => type === GroupType.MemorisationCommittee)).toHaveLength(1)
    await expect(db.insert(group).values({ type: GroupType.Board }).execute()).rejects.toMatchObject({
      cause: { constraint: "group_organisation_policy_check" }
    })
  })
})

/** Snapshot all data and enum labels that the cutover could otherwise overwrite or drop. */
async function legacyState(db: NonNullable<typeof database>["db"]) {
  const result = await db.execute<Record<string, unknown>>(sql`SELECT
    (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM "group" g) AS groups,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.group_id) FROM choir c) AS choirs,
    (SELECT jsonb_agg(to_jsonb(m)) FROM group_member m) AS memberships,
    (SELECT jsonb_agg(to_jsonb(p)) FROM position p) AS positions,
    (SELECT jsonb_agg(to_jsonb(h)) FROM position_holder h) AS holdings,
    (SELECT jsonb_agg(to_jsonb(e)) FROM event e) AS events,
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM drizzle.__drizzle_migrations m) AS ledger,
    enum_range(NULL::group_type)::text AS enum_values`)
  return result.rows
}
