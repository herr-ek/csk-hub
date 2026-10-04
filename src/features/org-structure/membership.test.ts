import { afterAll, describe, expect, test } from "bun:test"
import { and, asc, eq } from "drizzle-orm"
import { groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { changeVoice, endMembership, placeSinger, startMembership } from "./membership"
import { startPositionHolding } from "./positions"
import { listChoirMembersByVoiceFamily, listCurrentGroupMembers, listCurrentGroupsOfUser } from "./reads"
import { archiveGroup, createGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("groups membership", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function historyOf(userId: string) {
    return t.db
      .select({
        groupId: groupMember.groupId,
        startDate: groupMember.startDate,
        endDate: groupMember.endDate,
        voice: groupMember.voice
      })
      .from(groupMember)
      .where(eq(groupMember.userId, userId))
      .orderBy(asc(groupMember.startDate), asc(groupMember.endDate))
  }

  async function choirGroup(choirName: string) {
    const { id } = expectSuccess(
      await createGroup(t.db, { name: uniqueName("Rodd"), type: "Rodd", choirId: await t.groupId(choirName) })
    )
    return id
  }

  describe("startMembership", () => {
    test("joining a Choir's group starts a Membership in that Choir when there is none", async () => {
      const userId = await t.user()
      const rodd = await choirGroup("MK")
      expectSuccess(await startMembership(t.db, { userId, groupId: rodd, startDate: "2025-09-01" }))

      const groups = await listCurrentGroupsOfUser(t.db, userId)
      expect(groups.map(({ groupId }) => groupId).sort()).toEqual([await t.groupId("MK"), rodd].sort())
    })

    test("keeps an existing Choir Membership as it is", async () => {
      const userId = await t.user()
      const mk = await t.groupId("MK")
      expectSuccess(await startMembership(t.db, { userId, groupId: mk, startDate: "2024-01-01" }))
      expectSuccess(await startMembership(t.db, { userId, groupId: await choirGroup("MK"), startDate: "2025-01-01" }))

      const choirRows = (await historyOf(userId)).filter(({ groupId }) => groupId === mk)
      expect(choirRows).toEqual([{ groupId: mk, startDate: "2024-01-01", endDate: null, voice: null }])
    })

    test("refuses to start a group Membership before the Choir Membership it depends on", async () => {
      const userId = await t.user()
      expectSuccess(await startMembership(t.db, { userId, groupId: await t.groupId("DK"), startDate: "2025-01-01" }))
      expect(await startMembership(t.db, { userId, groupId: await choirGroup("DK"), startDate: "2024-01-01" })).toEqual(
        {
          success: false,
          error: "period-conflict"
        }
      )
    })

    test("a CSK-wide group needs no Choir Membership", async () => {
      const userId = await t.user()
      const { id } = expectSuccess(await createGroup(t.db, { name: uniqueName("Styret"), type: "Board" }))
      expectSuccess(await startMembership(t.db, { userId, groupId: id, startDate: "2025-01-01" }))
      expect(await historyOf(userId)).toEqual([{ groupId: id, startDate: "2025-01-01", endDate: null, voice: null }])
    })

    test("refuses a Section: singers are placed with a Voice", async () => {
      const userId = await t.user()
      expect(
        await startMembership(t.db, { userId, groupId: await t.groupId("MKB1"), startDate: "2025-01-01" })
      ).toEqual({ success: false, error: "section-requires-placement" })
    })

    test("refuses a second current Membership, an archived group and an invalid date", async () => {
      const userId = await t.user()
      const mk = await t.groupId("MK")
      expectSuccess(await startMembership(t.db, { userId, groupId: mk, startDate: "2025-01-01" }))
      expect(await startMembership(t.db, { userId, groupId: mk, startDate: "2025-02-01" })).toEqual({
        success: false,
        error: "already-member"
      })

      const { id } = expectSuccess(await createGroup(t.db, { name: uniqueName("Gig"), type: "GigGroup" }))
      expectSuccess(await archiveGroup(t.db, id))
      expect(await startMembership(t.db, { userId, groupId: id, startDate: "2025-01-01" })).toEqual({
        success: false,
        error: "group-archived"
      })

      expect(await startMembership(t.db, { userId, groupId: mk, startDate: "2025-02-30" })).toEqual({
        success: false,
        error: "invalid-date"
      })
    })

    test("a new period cannot overlap an earlier one", async () => {
      const userId = await t.user()
      const dk = await t.groupId("DK")
      expectSuccess(await startMembership(t.db, { userId, groupId: dk, startDate: "2020-01-01" }))
      expectSuccess(await endMembership(t.db, { userId, groupId: dk, endDate: "2022-01-01" }))

      expect(await startMembership(t.db, { userId, groupId: dk, startDate: "2021-06-01" })).toEqual({
        success: false,
        error: "period-conflict"
      })
      expectSuccess(await startMembership(t.db, { userId, groupId: dk, startDate: "2022-01-01" }))
    })
  })

  describe("placeSinger", () => {
    test("places a singer in the Choir and the one Section that sings their Voice", async () => {
      const userId = await t.user()
      const { sectionId } = expectSuccess(
        await placeSinger(t.db, { userId, choirId: await t.groupId("KK"), voice: "B2", startDate: "2022-08-25" })
      )

      expect(sectionId).toBe(await t.groupId("KKB"))
      expect(await historyOf(userId)).toEqual(
        expect.arrayContaining([
          { groupId: await t.groupId("KK"), startDate: "2022-08-25", endDate: null, voice: null },
          { groupId: sectionId, startDate: "2022-08-25", endDate: null, voice: "B2" }
        ])
      )
    })

    test("sets the Voice only on the Section Membership", async () => {
      const userId = await t.user()
      expectSuccess(
        await placeSinger(t.db, { userId, choirId: await t.groupId("MK"), voice: "T1", startDate: "2025-01-01" })
      )
      const voices = (await listCurrentGroupsOfUser(t.db, userId)).map(({ type, voice }) => [type, voice])
      expect(voices.sort()).toEqual([
        ["Choir", null],
        ["Section", "T1"]
      ])
    })

    test("refuses a second Section in the same Choir", async () => {
      const userId = await t.user()
      const mk = await t.groupId("MK")
      expectSuccess(await placeSinger(t.db, { userId, choirId: mk, voice: "B1", startDate: "2025-01-01" }))
      expect(await placeSinger(t.db, { userId, choirId: mk, voice: "T2", startDate: "2025-02-01" })).toEqual({
        success: false,
        error: "already-in-section"
      })
    })

    test("allows one Section in each of several Choirs", async () => {
      const userId = await t.user()
      expectSuccess(
        await placeSinger(t.db, { userId, choirId: await t.groupId("MK"), voice: "B1", startDate: "2025-01-01" })
      )
      expectSuccess(
        await placeSinger(t.db, { userId, choirId: await t.groupId("KK"), voice: "B1", startDate: "2025-01-01" })
      )

      const sections = (await listCurrentGroupsOfUser(t.db, userId)).filter(({ type }) => type === "Section")
      expect(sections.map(({ name }) => name).sort()).toEqual(["KKB", "MKB1"])
    })

    test("places a singer not yet in a division with the family, where a Section sings the family", async () => {
      const userId = await t.user()
      const { sectionId } = expectSuccess(
        await placeSinger(t.db, { userId, choirId: await t.groupId("KK"), voice: "B", startDate: "2025-01-01" })
      )
      expect(sectionId).toBe(await t.groupId("KKB"))
      expect(
        await placeSinger(t.db, {
          userId: await t.user(),
          choirId: await t.groupId("MK"),
          voice: "B",
          startDate: "2025-01-01"
        })
      ).toEqual({ success: false, error: "voice-not-sung-in-choir" })
    })

    test("refuses a Voice the Choir does not sing, and a group that is not a Choir", async () => {
      const userId = await t.user()
      expect(
        await placeSinger(t.db, { userId, choirId: await t.groupId("MK"), voice: "S1", startDate: "2025-01-01" })
      ).toEqual({ success: false, error: "voice-not-sung-in-choir" })
      expect(
        await placeSinger(t.db, { userId, choirId: await t.groupId("MKB1"), voice: "B1", startDate: "2025-01-01" })
      ).toEqual({ success: false, error: "choir-not-found" })
    })
  })

  describe("changeVoice", () => {
    test("within a Section ends the row and starts a new one, keeping Positions", async () => {
      const userId = await t.user()
      const kk = await t.groupId("KK")
      const kkb = await t.groupId("KKB")
      expectSuccess(await placeSinger(t.db, { userId, choirId: kk, voice: "B2", startDate: "2022-08-25" }))
      const stamforalder = await t.positionId("Stämförälder")
      expectSuccess(
        await startPositionHolding(t.db, { userId, groupId: kkb, positionId: stamforalder, startDate: "2024-01-01" })
      )

      expectSuccess(await changeVoice(t.db, { userId, choirId: kk, voice: "B1", date: "2025-09-01" }))

      const sectionRows = (await historyOf(userId)).filter(({ groupId }) => groupId === kkb)
      expect(sectionRows).toEqual([
        { groupId: kkb, startDate: "2022-08-25", endDate: "2025-09-01", voice: "B2" },
        { groupId: kkb, startDate: "2025-09-01", endDate: null, voice: "B1" }
      ])
      const holdings = await t.db.select().from(positionHolder).where(eq(positionHolder.userId, userId))
      expect(holdings.map(({ endDate }) => endDate)).toEqual([null])
    })

    test("from the family to a division stays in the Section that sings the family", async () => {
      const userId = await t.user()
      const kk = await t.groupId("KK")
      const kkb = await t.groupId("KKB")
      expectSuccess(await placeSinger(t.db, { userId, choirId: kk, voice: "B", startDate: "2024-08-20" }))

      const { sectionId } = expectSuccess(
        await changeVoice(t.db, { userId, choirId: kk, voice: "B2", date: "2024-10-01" })
      )

      expect(sectionId).toBe(kkb)
      expect((await historyOf(userId)).filter(({ groupId }) => groupId === kkb)).toEqual([
        { groupId: kkb, startDate: "2024-08-20", endDate: "2024-10-01", voice: "B" },
        { groupId: kkb, startDate: "2024-10-01", endDate: null, voice: "B2" }
      ])
    })

    test("between Sections moves the singer and ends their Positions in the old Section", async () => {
      const userId = await t.user()
      const mk = await t.groupId("MK")
      const [mkb1, mkb2] = [await t.groupId("MKB1"), await t.groupId("MKB2")]
      expectSuccess(await placeSinger(t.db, { userId, choirId: mk, voice: "B2", startDate: "2023-01-01" }))
      const stamforalder = await t.positionId("Stämförälder")
      expectSuccess(
        await startPositionHolding(t.db, { userId, groupId: mkb2, positionId: stamforalder, startDate: "2024-01-01" })
      )

      const { sectionId } = expectSuccess(
        await changeVoice(t.db, { userId, choirId: mk, voice: "B1", date: "2025-01-01" })
      )

      expect(sectionId).toBe(mkb1)
      const rows = (await historyOf(userId)).filter(({ groupId }) => groupId !== mk)
      expect(rows).toEqual([
        { groupId: mkb2, startDate: "2023-01-01", endDate: "2025-01-01", voice: "B2" },
        { groupId: mkb1, startDate: "2025-01-01", endDate: null, voice: "B1" }
      ])
      const [holding] = await t.db
        .select({ endDate: positionHolder.endDate })
        .from(positionHolder)
        .where(and(eq(positionHolder.userId, userId), eq(positionHolder.groupId, mkb2)))
      expect(holding?.endDate).toBe("2025-01-01")
    })

    test("refuses a non-singer, the same Voice, and a change dated before the Membership", async () => {
      const userId = await t.user()
      const dk = await t.groupId("DK")
      expect(await changeVoice(t.db, { userId, choirId: dk, voice: "S1", date: "2025-01-01" })).toEqual({
        success: false,
        error: "not-a-singer"
      })

      expectSuccess(await placeSinger(t.db, { userId, choirId: dk, voice: "S2", startDate: "2025-01-01" }))
      expect(await changeVoice(t.db, { userId, choirId: dk, voice: "S2", date: "2025-06-01" })).toEqual({
        success: false,
        error: "same-voice"
      })
      expect(await changeVoice(t.db, { userId, choirId: dk, voice: "S1", date: "2024-06-01" })).toEqual({
        success: false,
        error: "period-conflict"
      })
      expect((await historyOf(userId)).filter(({ endDate }) => endDate !== null)).toEqual([])
    })
  })

  describe("endMembership", () => {
    test("ends the Membership and the person's Positions in that group", async () => {
      const userId = await t.user()
      const kk = await t.groupId("KK")
      expectSuccess(await startMembership(t.db, { userId, groupId: kk, startDate: "2025-01-01" }))
      expectSuccess(
        await startPositionHolding(t.db, {
          userId,
          groupId: kk,
          positionId: await t.positionId("Notfiskal"),
          startDate: "2025-02-01"
        })
      )

      expectSuccess(await endMembership(t.db, { userId, groupId: kk, endDate: "2026-01-01" }))

      expect(await historyOf(userId)).toEqual([
        { groupId: kk, startDate: "2025-01-01", endDate: "2026-01-01", voice: null }
      ])
      const holdings = await t.db.select().from(positionHolder).where(eq(positionHolder.userId, userId))
      expect(holdings.map(({ endDate }) => endDate)).toEqual(["2026-01-01"])
    })

    test("leaving a Choir ends Memberships and Positions in every group that belongs to it", async () => {
      const userId = await t.user()
      const mk = await t.groupId("MK")
      const rodd = await choirGroup("MK")
      expectSuccess(await placeSinger(t.db, { userId, choirId: mk, voice: "T1", startDate: "2024-01-01" }))
      expectSuccess(await startMembership(t.db, { userId, groupId: rodd, startDate: "2024-02-01" }))
      expectSuccess(
        await startPositionHolding(t.db, {
          userId,
          groupId: await t.groupId("MKT1"),
          positionId: await t.positionId("Stämförälder"),
          startDate: "2024-03-01"
        })
      )

      expectSuccess(await endMembership(t.db, { userId, groupId: mk, endDate: "2026-06-30" }))

      expect(await listCurrentGroupsOfUser(t.db, userId)).toEqual([])
      expect((await historyOf(userId)).map(({ endDate }) => endDate)).toEqual([
        "2026-06-30",
        "2026-06-30",
        "2026-06-30"
      ])
      const holdings = await t.db.select().from(positionHolder).where(eq(positionHolder.userId, userId))
      expect(holdings.map(({ endDate }) => endDate)).toEqual(["2026-06-30"])
    })

    test("refuses when the user is not a current member", async () => {
      const userId = await t.user()
      expect(await endMembership(t.db, { userId, groupId: await t.groupId("DK"), endDate: "2025-01-01" })).toEqual({
        success: false,
        error: "not-a-member"
      })
    })
  })

  describe("reads", () => {
    test("lists current members of a group and of a Choir by Voice family", async () => {
      const kk = await t.groupId("KK")
      const [bass, tenor, alumnus] = [await t.user(), await t.user(), await t.user()]
      expectSuccess(await placeSinger(t.db, { userId: bass, choirId: kk, voice: "B1", startDate: "2025-01-01" }))
      expectSuccess(await placeSinger(t.db, { userId: tenor, choirId: kk, voice: "T2", startDate: "2025-01-01" }))
      expectSuccess(await placeSinger(t.db, { userId: alumnus, choirId: kk, voice: "B2", startDate: "2020-01-01" }))
      expectSuccess(await endMembership(t.db, { userId: alumnus, groupId: kk, endDate: "2024-06-30" }))

      const basses = (await listChoirMembersByVoiceFamily(t.db, kk, "B")).map(({ userId }) => userId)
      expect(basses).toContain(bass)
      expect(basses).not.toContain(tenor)
      expect(basses).not.toContain(alumnus)

      const members = (await listCurrentGroupMembers(t.db, await t.groupId("KKT"))).map(({ userId }) => userId)
      expect(members).toContain(tenor)
      expect(members).not.toContain(bass)
    })
  })
})
