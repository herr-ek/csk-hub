import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { GroupType, PositionCode } from "@/core/org-structure"
import {
  addDirectMembership,
  appointPosition,
  archiveGroup,
  createChoir,
  createOrganisationGroup
} from "@/features/org-structure-management"
import { createTestDatabase } from "../../../../test/database"
import { InactiveViewerError } from "../service"
import { getMemberCareer } from "./service"

const database = await createTestDatabase()

describe.skipIf(!database)("read-only member careers", () => {
  if (!database) return
  const { db, drop } = database
  afterAll(drop)
  async function person(name: string, banned = false) {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name, email: `${id}@example.com`, banned })
    return id
  }
  function ok<T>(result: { success: true; data: T } | { success: false; error: string }): T {
    if (!result.success) throw new Error(result.error)
    return result.data
  }
  test("ordinary members see past, current, archived and inferred participation without private account fields or prepared tenures", async () => {
    const viewer = await person("Ordinary viewer")
    const target = await person("Career subject")
    const choir = ok(
      await createChoir(db, {
        name: "Career choir",
        sections: ["S", "A", "T", "B"].map((voice) => ({
          name: `Career ${voice}`,
          voice: voice as "S" | "A" | "T" | "B"
        }))
      })
    )
    ok(await addDirectMembership(db, { userId: target, groupId: choir.choirId, startDate: "2021-08-01" }))
    ok(
      await addDirectMembership(db, {
        userId: target,
        groupId: choir.sections[0]?.id as string,
        voice: "S1",
        startDate: "2021-08-01",
        endDate: "2023-07-01"
      })
    )
    const board = ok(await createOrganisationGroup(db, { type: GroupType.Board, organisationYear: 2024 }))
    const concert = ok(await createOrganisationGroup(db, { type: GroupType.ConcertCommittee, organisationYear: 2024 }))
    ok(
      await appointPosition(db, {
        userId: target,
        contextGroupId: board.id,
        positionCode: PositionCode.FirstConcertMaster,
        startDate: "2024-07-01"
      })
    )
    const gig = ok(await createOrganisationGroup(db, { type: GroupType.GigGroup, name: "Retired career ensemble" }))
    ok(await addDirectMembership(db, { userId: target, groupId: gig.id, startDate: "2023-08-01" }))
    ok(
      await appointPosition(db, {
        userId: target,
        contextGroupId: gig.id,
        positionCode: PositionCode.GigLeader,
        startDate: "2023-08-01"
      })
    )
    ok(await archiveGroup(db, gig.id))
    ok(
      await appointPosition(db, {
        userId: target,
        contextGroupId: choir.choirId,
        positionCode: PositionCode.Conductor,
        startDate: "2027-01-01"
      })
    )
    const career = await getMemberCareer(db, viewer, target, "2026-10-22")
    expect(career).toMatchObject({ person: { id: target, name: "Career subject" }, isOwn: false })
    expect(Object.keys(career?.person ?? {}).sort()).toEqual(["id", "image", "name"])
    expect(career?.records.some(({ positionCode }) => positionCode === PositionCode.Conductor)).toBe(false)
    expect(career?.records.filter(({ group, kind }) => group.id === board.id && kind === "position")).toHaveLength(1)
    expect(career?.records.filter(({ group, kind }) => group.id === board.id && kind === "membership")).toHaveLength(0)
    expect(career?.records.find(({ group }) => group.id === concert.id)).toMatchObject({
      kind: "membership",
      positionCode: PositionCode.FirstConcertMaster,
      sourceContextId: board.id
    })
    expect(career?.records.find(({ group }) => group.id === gig.id)?.group.active).toBe(false)
    expect(career?.records.some(({ voice, endDate }) => voice === "S1" && endDate === "2023-07-01")).toBe(true)
    expect(career?.records[0]?.startDate).toBe("2021-08-01")
    expect((await getMemberCareer(db, target, target))?.isOwn).toBe(true)
    const counts = career?.records.length
    expect((await getMemberCareer(db, viewer, target, "2026-10-22"))?.records).toHaveLength(counts as number)
    await db.update(user).set({ banned: true }).where(eq(user.id, target))
    expect(await getMemberCareer(db, viewer, target)).toBeNull()
  })
  test("missing and banned viewers are refused; an empty career stays empty", async () => {
    const viewer = await person("Empty member")
    const banned = await person("Banned", true)
    expect(await getMemberCareer(db, viewer, viewer)).toMatchObject({ records: [] })
    expect(await getMemberCareer(db, viewer, "missing")).toBeNull()
    await expect(getMemberCareer(db, "missing", viewer)).rejects.toBeInstanceOf(InactiveViewerError)
    await expect(getMemberCareer(db, banned, viewer)).rejects.toBeInstanceOf(InactiveViewerError)
  })
})
