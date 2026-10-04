import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { group, groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { createOrgStructureTestDatabase } from "./test-support"

// The constraints the database enforces by itself, written to directly so that the module's own
// checks cannot mask a missing constraint.

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("groups schema constraints", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("rejects a Section Membership whose Voice the Section's Voice does not contain", async () => {
    const userId = await t.user()
    const mkb1 = await t.groupId("MKB1")

    for (const voice of ["B2", "B"] as const) {
      await expect(
        t.db.insert(groupMember).values({ userId, groupId: mkb1, startDate: "2025-01-01", voice }).execute()
      ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_containment_check" } })
    }
    await t.db.insert(groupMember).values({ userId, groupId: mkb1, startDate: "2025-01-01", voice: "B1" })
  })

  test("accepts the family or any of its divisions in a Section that sings the family", async () => {
    const kkb = await t.groupId("KKB")
    for (const voice of ["B", "B1", "B2"] as const) {
      await t.db.insert(groupMember).values({ userId: await t.user(), groupId: kkb, startDate: "2025-01-01", voice })
    }
    await expect(
      t.db
        .insert(groupMember)
        .values({ userId: await t.user(), groupId: kkb, startDate: "2025-01-01", voice: "T1" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_containment_check" } })
  })

  test("rechecks the Voice when a Membership is updated", async () => {
    const userId = await t.user()
    const kkb = await t.groupId("KKB")
    await t.db.insert(groupMember).values({ userId, groupId: kkb, startDate: "2025-01-01", voice: "B1" })
    await expect(
      t.db.update(groupMember).set({ voice: "A1" }).where(eq(groupMember.userId, userId)).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_member_voice_containment_check" } })
  })

  test("sets a Voice exactly on Section Memberships", async () => {
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

  test("keeps a Choir CSK-wide, and a Section inside a Choir", async () => {
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

    await t.db.insert(group).values({ name: "Valberedningen", type: "Committee" })
    await expect(
      t.db.insert(group).values({ name: "Valberedningen", type: "Committee" }).execute()
    ).rejects.toMatchObject({
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
