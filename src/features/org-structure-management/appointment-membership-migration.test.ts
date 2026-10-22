import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { insertReferenceData } from "../../../scripts/ops/reference-data"
import { DEMO_ORGANISATION_YEAR } from "../../../scripts/ops/seed-data"
import { seedDemo } from "../../../scripts/seed-demo"
import { createTestDatabase } from "../../../test/database"
import { appointmentMemberships } from "./appointment-memberships"
import { listEffectiveMembersForGroupsAt } from "./appointments"

const folder = mkdtempSync(join(tmpdir(), "csk-before-derived-memberships-"))
cpSync("drizzle", folder, { recursive: true })
const journal = JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8"))
journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 20)
writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal))
const database = await createTestDatabase(folder)

afterAll(async () => {
  await database?.drop()
  rmSync(folder, { recursive: true, force: true })
})

describe.skipIf(!database)("derived appointment membership migration", () => {
  test("removes stored grants, preserves participation, and reproduces their targets for all demo years", async () => {
    const { db, url } = database as NonNullable<typeof database>
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      await insertReferenceData(client, DEMO_ORGANISATION_YEAR)
    } finally {
      await client.end()
    }
    await seedDemo(db)
    const derived = appointmentMemberships(db)
    // Use the old SQL policy to recreate persisted connections independently of the new query.
    await db.execute(sql`INSERT INTO appointment_grant (appointment_id, group_id)
      SELECT appointment.id, target.id FROM position_appointment appointment
      JOIN "group" context ON context.id = appointment.context_group_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
        organisation_position_policy(appointment.position_code)->'grants'
      ) AS granted(type)
      JOIN "group" target ON target.type::text = granted.type
        AND (target.type <> context.type OR target.id = context.id)
        AND (organisation_group_policy(target.type::text)->>'lifetime' <> 'annual'
          OR target.organisation_year = appointment.organisation_year)`)
    const beforeGrants = await db.execute<{ appointmentId: string; groupId: string }>(sql`
      SELECT appointment_id AS "appointmentId", group_id AS "groupId"
      FROM appointment_grant ORDER BY appointment_id, group_id
    `)
    expect(beforeGrants.rows.length).toBeGreaterThan(0)
    const before = {
      groups: await db.select().from(group),
      appointments: await db.select().from(positionAppointment),
      direct: await db.select().from(directMembership)
    }
    const ids = before.groups.map(({ id }) => id)
    const dates = ["2024-10-22", "2025-10-22", "2026-10-22", "2027-07-01", "2027-10-22"]
    const rosters = await Promise.all(dates.map((date) => listEffectiveMembersForGroupsAt(db, ids, date)))

    await migrate(db, { migrationsFolder: "drizzle" })

    expect(
      await db.execute(sql`SELECT to_regclass('public.appointment_grant') AS table_name,
      to_regprocedure('check_appointment_grant()') AS trigger_function`)
    ).toMatchObject({
      rows: [{ table_name: null, trigger_function: null }]
    })
    expect(await db.select().from(group)).toEqual(before.groups)
    expect(await db.select().from(positionAppointment)).toEqual(before.appointments)
    expect(await db.select().from(directMembership)).toEqual(before.direct)
    expect(await db.select().from(derived).orderBy(derived.appointmentId, derived.groupId)).toEqual(beforeGrants.rows)
    expect(await Promise.all(dates.map((date) => listEffectiveMembersForGroupsAt(db, ids, date)))).toEqual(rosters)
  }, 30_000)
})
