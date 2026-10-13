import { describe, expect } from "bun:test"
import { databaseTest } from "@test/database-test"
import { eq } from "drizzle-orm"
import { group, groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { orgStructureFixture } from "./test-support"

// The constraints the database enforces by itself, written to directly so that the module's own
// checks cannot mask a missing constraint.

const test = databaseTest(orgStructureFixture)

describe("groups schema constraints", () => {
  test("rejects a Section Membership whose Voice the Section's Voice does not contain", async (t) => {
    const userId = await t.user()
    const mkb1 = await t.groupId("MKB1")

    await expect(
      t.db.insert(groupMember).values({ userId, groupId: mkb1, startDate: "2025-01-01", voice: "B2" }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_containment_check" } })
    await t.db.insert(groupMember).values({ userId, groupId: mkb1, startDate: "2025-01-01", voice: "B1" })
  })

  test("accepts any division of the family in a Section that sings the family", async (t) => {
    const kkb = await t.groupId("KKB")
    for (const voice of ["B1", "B2"] as const) {
      await t.db.insert(groupMember).values({ userId: await t.user(), groupId: kkb, startDate: "2025-01-01", voice })
    }
    await expect(
      t.db
        .insert(groupMember)
        .values({ userId: await t.user(), groupId: kkb, startDate: "2025-01-01", voice: "T1" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_containment_check" } })
  })

  test("records a singer's Voice in divisions only, through the voice_division domain", async (t) => {
    const kkb = await t.groupId("KKB")
    await expect(
      t.db
        .insert(groupMember)
        .values({ userId: await t.user(), groupId: kkb, startDate: "2025-01-01", voice: "B" as never })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "voice_division_check" } })
  })

  test("rechecks the Voice when a Membership is updated", async (t) => {
    const userId = await t.user()
    const kkb = await t.groupId("KKB")
    await t.db.insert(groupMember).values({ userId, groupId: kkb, startDate: "2025-01-01", voice: "B1" })
    await expect(
      t.db.update(groupMember).set({ voice: "A1" }).where(eq(groupMember.userId, userId)).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_containment_check" } })
  })

  test("sets a Voice exactly on Section Memberships", async (t) => {
    const userId = await t.user()
    await t.db.insert(groupMember).values({ userId, groupId: await t.groupId("MK"), startDate: "2025-01-01" })

    await expect(
      t.db
        .insert(groupMember)
        .values({ userId, groupId: await t.groupId("KK"), startDate: "2025-01-01", voice: "B1" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_section_check" } })
    await expect(
      t.db
        .insert(groupMember)
        .values({ userId, groupId: await t.groupId("MKB1"), startDate: "2025-01-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_section_check" } })
  })

  test("keeps a Choir CSK-wide, and a Section inside a Choir", async (t) => {
    await expect(
      t.db
        .insert(group)
        .values({ name: "Nested choir", type: "Choir", choirId: await t.groupId("MK") })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_choir_csk_wide_check" } })
    await expect(t.db.insert(group).values({ name: "Loose section", type: "Section" }).execute()).rejects.toMatchObject(
      { cause: { constraint: "group_section_in_choir_check" } }
    )
  })

  test("rejects a second current Membership of the same user in a group, but keeps history", async (t) => {
    const userId = await t.user()
    const mk = await t.groupId("MK")
    await t.db.insert(groupMember).values({ userId, groupId: mk, startDate: "2020-01-01", endDate: "2021-01-01" })
    await t.db.insert(groupMember).values({ userId, groupId: mk, startDate: "2022-01-01" })

    await expect(
      t.db.insert(groupMember).values({ userId, groupId: mk, startDate: "2023-01-01" }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_current_unique" } })
  })

  test("rejects a second current holder of the same Position in a group", async (t) => {
    const [first, second] = [await t.user(), await t.user()]
    const kk = await t.groupId("KK")
    const conductor = await t.positionId("Dirigent")
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

  test("scopes active group names to their Choir, with CSK-wide names unique among themselves", async (t) => {
    const [mk, kk] = [await t.groupId("MK"), await t.groupId("KK")]
    await t.db.insert(group).values({ name: "Roddgrupp", type: "Roddgrupp", choirId: mk })
    await t.db.insert(group).values({ name: "Roddgrupp", type: "Roddgrupp", choirId: kk })

    await t.db.insert(group).values({ name: "Valberedningen", type: "Valberedning" })
    await expect(
      t.db.insert(group).values({ name: "Valberedningen", type: "Valberedning" }).execute()
    ).rejects.toMatchObject({
      cause: { constraint: "group_name_choir_active_unique" }
    })
  })

  test("frees an archived group's name", async (t) => {
    await t.db.insert(group).values({ name: "Festgrupp", type: "Festgrupp", active: false })
    await t.db.insert(group).values({ name: "Festgrupp", type: "Festgrupp" })
  })

  test("rejects a period that ends before it starts", async (t) => {
    const userId = await t.user()
    await expect(
      t.db
        .insert(groupMember)
        .values({ userId, groupId: await t.groupId("DK"), startDate: "2025-01-02", endDate: "2025-01-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_period_check" } })
  })
})
