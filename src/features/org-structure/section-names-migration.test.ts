import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { user } from "@/core/db/schema/auth"
import { choir, directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { createTestDatabase } from "../../../test/database"

const folder = mkdtempSync(join(tmpdir(), "csk-before-section-names-"))
cpSync("drizzle", folder, { recursive: true })
const naming = readdirSync(folder).find((name) => name.endsWith("_derive-section-names"))
if (!naming) throw new Error("Missing Section naming migration")
rmSync(join(folder, naming), { recursive: true })
const database = await createTestDatabase(folder)
afterAll(async () => {
  await database?.drop()
  rmSync(folder, { recursive: true, force: true })
})

describe.skipIf(!database)("Section naming migration", () => {
  test("clears only redundant Section names and preserves identities, periods, appointments, and other names", async () => {
    if (!database) return
    const { db } = database
    const userId = crypto.randomUUID()
    await db.insert(user).values({ id: userId, name: "Retained singer", email: `${userId}@example.com` })
    const [kk] = await db.insert(group).values({ type: GroupType.Choir, name: "KK" }).returning()
    if (!kk) throw new Error("Missing Choir fixture")
    await db.insert(choir).values({ groupId: kk.id })
    const [bass] = await db
      .insert(group)
      .values({ type: GroupType.Section, name: "Old bass label", choirId: kk.id })
      .returning()
    if (!bass) throw new Error("Missing Section fixture")
    await db.insert(section).values({ groupId: bass.id, voice: "B" })
    await db.insert(group).values({ type: GroupType.GigGroup, name: "Summer ensemble" })
    await db.insert(group).values({ type: GroupType.ParentsMeeting })
    await db.insert(directMembership).values([
      { userId, groupId: kk.id, startDate: "2020-08-01" },
      { userId, groupId: bass.id, startDate: "2020-08-01", endDate: "2021-07-01", voice: "B1" },
      { userId, groupId: bass.id, startDate: "2021-07-01", voice: "B2" }
    ])
    await db.insert(positionAppointment).values({
      userId,
      positionCode: PositionCode.SectionParent,
      contextGroupId: bass.id,
      startDate: "2021-08-01",
      endDate: "2022-07-01"
    })
    const groups = await db.select().from(group).orderBy(group.id)
    const sections = await db.select().from(section)
    const memberships = await db.select().from(directMembership).orderBy(directMembership.id)
    const appointments = await db.select().from(positionAppointment)
    await migrate(db, { migrationsFolder: "drizzle" })
    expect(await db.select().from(group).orderBy(group.id)).toEqual(
      groups.map((row) => (row.type === GroupType.Section ? { ...row, name: null } : row))
    )
    expect(await db.select().from(section)).toEqual(sections)
    expect(await db.select().from(directMembership).orderBy(directMembership.id)).toEqual(memberships)
    expect(await db.select().from(positionAppointment)).toEqual(appointments)
    await expect(
      db.update(group).set({ name: "Independent name" }).where(eq(group.id, bass.id)).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_name_policy_check" } })
  })
})
