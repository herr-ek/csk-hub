import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq, sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { user } from "@/core/db/schema/auth"
import { choir, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { createTestDatabase } from "../../../test/database"
import { appointmentMemberships } from "./appointment-memberships"

const folder = mkdtempSync(join(tmpdir(), "csk-before-derived-labels-"))
cpSync("drizzle", folder, { recursive: true })
const journal = JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8"))
journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 19)
writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal))
const database = await createTestDatabase(folder)

afterAll(async () => {
  await database?.drop()
  rmSync(folder, { recursive: true, force: true })
})

describe.skipIf(!database)("derived Group label migration", () => {
  test("retains identities and participation, removes fixed labels, and keeps explicit names unique", async () => {
    const { db } = database as NonNullable<typeof database>
    const userId = crypto.randomUUID()
    await db.insert(user).values({ id: userId, name: "Migrated holder", email: `${userId}@example.com` })
    const [mk] = await db.insert(group).values({ name: "MK", type: GroupType.Choir }).returning()
    if (!mk) throw new Error("Missing Choir fixture")
    await db.insert(choir).values({ groupId: mk.id })
    const [board, team, gig] = await db
      .insert(group)
      .values([
        { name: "An old Board name", type: GroupType.Board, organisationYear: 2025 },
        { name: "An old team name", type: GroupType.EquipmentTeam, choirId: mk.id },
        { name: "Summer ensemble", type: GroupType.GigGroup }
      ])
      .returning()
    if (!board || !team || !gig) throw new Error("Missing Group fixtures")
    const [appointment] = await db
      .insert(positionAppointment)
      .values({
        userId,
        contextGroupId: board.id,
        positionCode: PositionCode.Chair,
        organisationYear: 2025,
        startDate: "2025-07-01",
        endDate: "2026-07-01"
      })
      .returning()
    if (!appointment) throw new Error("Missing appointment fixture")
    await db.execute(
      sql`INSERT INTO appointment_grant (appointment_id, group_id) VALUES (${appointment.id}, ${board.id})`
    )
    await db.insert(directMembership).values({ userId, groupId: gig.id, startDate: "2025-01-01" })
    const before = {
      appointments: await db.select().from(positionAppointment),
      grants: await db.select().from(appointmentMemberships(db)),
      memberships: await db.select().from(directMembership)
    }
    await migrate(db, { migrationsFolder: "drizzle" })
    expect(await db.select().from(group).where(eq(group.id, board.id))).toMatchObject([{ ...board, name: null }])
    expect(await db.select().from(group).where(eq(group.id, team.id))).toMatchObject([{ ...team, name: null }])
    expect(await db.select().from(group).where(eq(group.id, gig.id))).toEqual([gig])
    expect(await db.select().from(positionAppointment)).toEqual(before.appointments)
    expect(await db.select().from(appointmentMemberships(db))).toEqual(before.grants)
    expect(await db.select().from(directMembership)).toEqual(before.memberships)
    await expect(
      db.insert(group).values({ name: "Forged name", type: GroupType.Board, organisationYear: 2026 }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_name_policy_check" } })
    await expect(db.insert(group).values({ type: GroupType.GigGroup }).execute()).rejects.toMatchObject({
      cause: { constraint: "group_name_policy_check" }
    })
    await expect(db.insert(group).values({ name: gig.name, type: GroupType.GigGroup }).execute()).rejects.toMatchObject(
      {
        cause: { constraint: "group_name_choir_active_unique" }
      }
    )
  })
})
