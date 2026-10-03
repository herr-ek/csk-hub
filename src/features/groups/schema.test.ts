import { afterAll, describe, expect, test } from "bun:test"
import { group, groupMember, positionHolder } from "@/core/db/schema/groups"
import { createGroupsTestDatabase } from "./test-support"

// The constraints the database enforces by itself, written to directly so that the module's own
// checks cannot mask a missing constraint.

const database = await createGroupsTestDatabase()

describe.skipIf(!database)("groups schema constraints", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("rejects a Section Membership whose Voice the Section does not sing", async () => {
    const userId = await t.user()
    const mkb1 = await t.groupId("MKB1")

    await expect(
      t.db.insert(groupMember).values({ userId, groupId: mkb1, startDate: "2025-01-01", voice: "B2" }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_section_voice_fk" } })
    await t.db.insert(groupMember).values({ userId, groupId: mkb1, startDate: "2025-01-01", voice: "B1" })
  })

  test("leaves the Voice key unchecked on Memberships without a Voice", async () => {
    const userId = await t.user()
    await t.db.insert(groupMember).values({ userId, groupId: await t.groupId("MK"), startDate: "2025-01-01" })
  })

  test("rejects a second current Membership of the same user in a group, but keeps history", async () => {
    const userId = await t.user()
    const mk = await t.groupId("MK")
    await t.db.insert(groupMember).values({ userId, groupId: mk, startDate: "2020-01-01", endDate: "2021-01-01" })
    await t.db.insert(groupMember).values({ userId, groupId: mk, startDate: "2022-01-01" })

    await expect(
      t.db.insert(groupMember).values({ userId, groupId: mk, startDate: "2023-01-01" }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_current_unique" } })
  })

  test("rejects a second current holder of the same Position in a group", async () => {
    const [first, second] = [await t.user(), await t.user()]
    const kk = await t.groupId("KK")
    const conductor = await t.positionId("Conductor")
    await t.db
      .insert(positionHolder)
      .values({ userId: first, groupId: kk, positionId: conductor, startDate: "2025-01-01" })

    await expect(
      t.db
        .insert(positionHolder)
        .values({ userId: second, groupId: kk, positionId: conductor, startDate: "2025-02-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "position_holder_current_unique" } })
  })

  test("scopes active group names to their Choir, with CSK-wide names unique among themselves", async () => {
    const [mk, kk] = [await t.groupId("MK"), await t.groupId("KK")]
    await t.db.insert(group).values({ name: "Roddgrupp", type: "Rodd", choirId: mk })
    await t.db.insert(group).values({ name: "Roddgrupp", type: "Rodd", choirId: kk })

    await t.db.insert(group).values({ name: "Styret", type: "Board" })
    await expect(t.db.insert(group).values({ name: "Styret", type: "Board" }).execute()).rejects.toMatchObject({
      cause: { constraint: "group_name_choir_active_unique" }
    })
  })

  test("frees an archived group's name", async () => {
    await t.db.insert(group).values({ name: "Festgrupp", type: "Fest", active: false })
    await t.db.insert(group).values({ name: "Festgrupp", type: "Fest" })
  })

  test("rejects a period that ends before it starts", async () => {
    const userId = await t.user()
    await expect(
      t.db
        .insert(groupMember)
        .values({ userId, groupId: await t.groupId("DK"), startDate: "2025-01-02", endDate: "2025-01-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_period_check" } })
  })
})
