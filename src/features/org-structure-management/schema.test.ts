import { afterAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { createOrganisationGroup } from "./appointments"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("final organisation schema", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("a fresh migration contains only the final organisation representation", async () => {
    const result = await t.db.execute(sql`
      SELECT to_regclass('public.group_member') AS old_membership,
             to_regclass('public.position') AS old_position,
             to_regclass('public.position_holder') AS old_holding,
             to_regclass('public.group_type_position') AS old_applicability,
             to_regclass('public.position_group') AS old_restriction,
             EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'group' AND column_name = 'uses_appointment_model') AS has_marker
    `)
    expect(result.rows[0]).toEqual({
      old_membership: null,
      old_position: null,
      old_holding: null,
      old_applicability: null,
      old_restriction: null,
      has_marker: false
    })
  })

  test("Section Voice containment and direct period overlap are database enforced", async () => {
    const userId = await t.user()
    const sectionId = await t.groupId("MKB1")
    await expect(
      t.db
        .insert(directMembership)
        .values({ userId, groupId: sectionId, startDate: "2025-01-01", voice: "B2" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "direct_membership_voice_check" } })
    await t.db.insert(directMembership).values({ userId, groupId: sectionId, startDate: "2025-01-01", voice: "B1" })
    await expect(
      t.db
        .insert(directMembership)
        .values({ userId, groupId: sectionId, startDate: "2025-06-01", endDate: "2025-08-01", voice: "B1" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "direct_membership_overlap_excl" } })
  })

  test("appointments reject unknown Position codes and annual dates outside their Group year", async () => {
    const boardId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Schema Board", type: "Board", organisationYear: 2040 })
    ).id
    const userId = await t.user()
    await expect(
      t.db
        .insert(positionAppointment)
        .values({
          userId,
          positionCode: "invented-post",
          contextGroupId: boardId,
          organisationYear: 2040,
          startDate: "2040-07-01",
          endDate: "2041-07-01"
        })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "position_appointment_policy_check" } })
    await expect(
      t.db
        .insert(positionAppointment)
        .values({
          userId,
          positionCode: "ordforande",
          contextGroupId: boardId,
          organisationYear: 2040,
          startDate: "2040-06-30",
          endDate: "2041-07-01"
        })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "position_appointment_annual_check" } })
  })

  test("known Group types require their fixed scope and annual identity", async () => {
    await expect(t.db.insert(group).values({ name: "Missing year", type: "Board" }).execute()).rejects.toMatchObject({
      cause: { constraint: "group_organisation_policy_check" }
    })
    await expect(
      t.db
        .insert(group)
        .values({ name: "Choir-owned Board", type: "Board", choirId: await t.groupId("MK"), organisationYear: 2042 })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_organisation_policy_check" } })
  })
})
