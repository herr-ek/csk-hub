import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import type { OrgStructureResult } from "@/core/org-structure"
import { GroupType, hasExplicitGroupName, PositionCode } from "@/core/org-structure"
import {
  appointPosition,
  createChoir,
  createOrganisationGroup,
  listAppointmentsForGroup,
  listEffectiveMembersAt,
  listEffectiveParticipationOfUserAt,
  placeSingerInSection,
  renameGroup
} from "@/features/org-structure"
import { createTestDatabase } from "../../../test/database"
import { getMemberProfile, listMemberDirectory } from "./service"

function expectSuccess<T>(result: OrgStructureResult<T>): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}
const database = await createTestDatabase()
describe.skipIf(!database)("derived Section names", () => {
  if (!database) return
  const identities = new Map<string, string>()
  const t = {
    ...database,
    async user(name: string) {
      const id = crypto.randomUUID()
      await database.db.insert(user).values({ id, name, email: `${id}@example.com` })
      return id
    },
    async groupId(name: string) {
      const id = identities.get(name)
      if (!id) throw new Error(`Missing ${name}`)
      return id
    }
  }
  afterAll(t.drop)
  beforeAll(async () => {
    for (const [name, voices] of [
      ["MK", ["T1", "T2", "B1", "B2"]],
      ["DK", ["S1", "S2", "A1", "A2"]],
      ["KK", ["S", "A", "T", "B"]]
    ] as const) {
      const result = expectSuccess(await createChoir(t.db, { name, sections: voices.map((voice) => ({ voice })) }))
      identities.set(name, result.choirId)
      for (const section of result.sections) identities.set(section.name, section.id)
    }
  })

  test("family and division Sections use their own Voice, and Choir renames preserve participation identities", async () => {
    const userId = await t.user("Section name singer")
    const viewerId = await t.user("Section name viewer")
    const placements = [
      { choir: "MK", section: "MKB1", voice: "B1" },
      { choir: "DK", section: "DKA2", voice: "A2" },
      { choir: "KK", section: "KKB", voice: "B2" }
    ] as const
    for (const placement of placements)
      expectSuccess(
        await placeSingerInSection(t.db, {
          userId,
          sectionId: await t.groupId(placement.section),
          voice: placement.voice,
          startDate: "2026-08-01"
        })
      )
    const kkId = await t.groupId("KK")
    const sectionId = await t.groupId("KKB")
    const parents = expectSuccess(await createOrganisationGroup(t.db, { type: GroupType.ParentsMeeting }))
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.SectionParent,
        contextGroupId: sectionId,
        startDate: "2026-08-01"
      })
    )
    const profile = await getMemberProfile(t.db, viewerId, userId, "2026-10-22")
    expect(profile?.choirs.map(({ section }) => section?.name).sort()).toEqual(["DKA2", "KKB", "MKB1"])
    expect(profile?.choirs.find(({ groupId }) => groupId === kkId)?.section).toMatchObject({
      groupId: sectionId,
      name: "KKB",
      sectionVoice: "B",
      voice: "B2"
    })
    expect(
      (await listMemberDirectory(t.db, viewerId, { query: "Section name singer" })).members[0]?.choirs.find(
        ({ id }) => id === kkId
      )?.section
    ).toBe("KKB")
    const memberships = await t.db
      .select()
      .from(directMembership)
      .where(eq(directMembership.userId, userId))
      .orderBy(directMembership.id)
    const appointments = await t.db.select().from(positionAppointment).where(eq(positionAppointment.userId, userId))
    expectSuccess(await renameGroup(t.db, kkId, "RKK"))
    const renamed = await getMemberProfile(t.db, viewerId, userId, "2026-10-22")
    expect(renamed?.choirs.find(({ groupId }) => groupId === kkId)?.section).toMatchObject({
      groupId: sectionId,
      name: "RKKB",
      sectionVoice: "B",
      voice: "B2"
    })
    expect(
      (await listEffectiveParticipationOfUserAt(t.db, userId, "2026-10-22")).positions.find(
        ({ id }) => id === appointment.id
      )?.contextName
    ).toBe("RKKB")
    expect(
      (await listMemberDirectory(t.db, viewerId, { query: "Section name singer" })).members[0]?.choirs.find(
        ({ id }) => id === kkId
      )?.section
    ).toBe("RKKB")
    expect(
      (await listAppointmentsForGroup(t.db, parents.id)).find(({ id }) => id === appointment.id)?.contextName
    ).toBe("RKKB")
    expect((await listEffectiveMembersAt(t.db, parents.id, "2026-10-22"))[0]?.positions[0]?.contextName).toBe("RKKB")
    expect(
      await t.db.select().from(directMembership).where(eq(directMembership.userId, userId)).orderBy(directMembership.id)
    ).toEqual(memberships)
    expect(await t.db.select().from(positionAppointment).where(eq(positionAppointment.userId, userId))).toEqual(
      appointments
    )
    expect(await t.db.select().from(group).where(eq(group.id, sectionId))).toMatchObject([
      { id: sectionId, choirId: kkId, name: null }
    ])
  })

  test("Sections cannot be independently named through commands or SQL", async () => {
    const sectionId = await t.groupId("MKB1")
    expect(hasExplicitGroupName(GroupType.Section)).toBe(false)
    expect(await renameGroup(t.db, sectionId, "Custom basses")).toEqual({ success: false, error: "group-name-derived" })
    await expect(
      t.db.update(group).set({ name: "Custom basses" }).where(eq(group.id, sectionId)).execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_name_policy_check" } })
    expect(
      await t.db
        .select()
        .from(group)
        .where(and(eq(group.id, sectionId), eq(group.type, GroupType.Section)))
    ).toMatchObject([{ name: null }])
  })
})
