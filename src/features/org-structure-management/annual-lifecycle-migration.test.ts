import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { createTestDatabase } from "../../../test/database"
import { listOrganisationGroups } from "./group-management"
import { listPositionOverview } from "./position-overview"

const folder = mkdtempSync(join(tmpdir(), "csk-before-annual-lifecycle-"))
cpSync("drizzle", folder, { recursive: true })
const journal = JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8"))
journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 21)
writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal))
const database = await createTestDatabase(folder)

afterAll(async () => {
  await database?.drop()
  rmSync(folder, { recursive: true, force: true })
})

describe.skipIf(!database)("annual Group lifecycle migration", () => {
  test("restores date-based annual lifecycle without altering tenures or continuing retirement", async () => {
    const { db } = database as NonNullable<typeof database>
    const userId = crypto.randomUUID()
    await db.insert(user).values({ id: userId, name: "Board holder", email: `${userId}@example.com` })
    const [board, gig] = await db
      .insert(group)
      .values([
        { type: GroupType.Board, organisationYear: 2026, active: false },
        { type: GroupType.GigGroup, name: "Retired ensemble", active: false }
      ])
      .returning()
    if (!board || !gig) throw new Error("Missing migration fixtures")
    await db.insert(positionAppointment).values({
      userId,
      positionCode: PositionCode.Chair,
      contextGroupId: board.id,
      organisationYear: 2026,
      startDate: "2026-07-01",
      endDate: "2027-07-01"
    })
    await db.insert(directMembership).values({ userId, groupId: gig.id, startDate: "2024-07-01" })
    const appointments = await db.select().from(positionAppointment)
    const memberships = await db.select().from(directMembership)
    await migrate(db, { migrationsFolder: "drizzle" })
    expect(await db.select().from(group).where(eq(group.id, board.id))).toEqual([{ ...board, active: true }])
    expect(await db.select().from(group).where(eq(group.id, gig.id))).toEqual([gig])
    expect(await db.select().from(positionAppointment)).toEqual(appointments)
    expect(await db.select().from(directMembership)).toEqual(memberships)
    for (const [date, phase, holders] of [
      ["2026-06-30", "future", 0],
      ["2026-07-01", "current", 1],
      ["2027-07-01", "completed", 0]
    ] as const) {
      expect((await listOrganisationGroups(db, date)).find(({ id }) => id === board.id)?.phase).toBe(phase)
      expect(await listPositionOverview(db, date)).toHaveLength(holders)
    }
    await expect(db.update(group).set({ active: false }).where(eq(group.id, board.id)).execute()).rejects.toMatchObject(
      { cause: { constraint: "group_annual_active_check" } }
    )
    await expect(
      db.insert(group).values({ type: GroupType.Board, organisationYear: 2027, active: false }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_annual_active_check" } })
  })
})
