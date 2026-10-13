import { afterAll, describe, expect, test } from "bun:test"
import { count, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { conversation, directConversation } from "@/core/db/schema/messaging"
import { findDirectConversation } from "@/features/messaging/reading"
import {
  archiveGroup,
  changeVoice,
  createChoir,
  createGroup,
  createPosition,
  endPositionHolding,
  placeSinger,
  startLinkedPosition,
  startMembership,
  startPositionHolding
} from "@/features/org-structure"
import type { OrgStructureResult } from "@/features/org-structure/model"
import { setVoiceCapabilities } from "@/features/voice"
import type { Voice } from "@/features/voice/model"
import { createTestDatabase } from "../../../test/database"
import { DIRECTORY_PAGE_SIZE, getMemberProfile, InactiveViewerError, listMemberDirectory } from "./service"

const database = await createTestDatabase()

describe.skipIf(!database)("Member profile and directory reads", () => {
  if (!database) return
  const { db, drop } = database
  afterAll(drop)
  const unique = (name: string) => `${name} ${crypto.randomUUID()}`
  function success<T>(result: OrgStructureResult<T>): T {
    if (!result.success) throw new Error(result.error)
    return result.data
  }
  async function member(name = "Member", extra: { username?: string; banned?: boolean } = {}) {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name, email: `${id}@example.com`, ...extra })
    return id
  }
  async function choir(name: string, voices: Voice[] = ["S", "A", "T", "B"]) {
    return success(
      await createChoir(db, {
        name: unique(name),
        sections: voices.map((voice) => ({ name: `${name}${voice}`, voice }))
      })
    )
  }

  test("shared profiles omit email and permissions; only the owner receives email", async () => {
    const viewer = await member()
    const target = await member("Ada")
    const shared = await getMemberProfile(db, viewer, target)
    expect(shared).toMatchObject({
      id: target,
      email: null,
      isOwn: false,
      capabilities: [],
      choirs: [],
      groups: [],
      positions: []
    })
    expect(shared).not.toHaveProperty("role")
    expect(await getMemberProfile(db, target, target)).toMatchObject({ email: `${target}@example.com`, isOwn: true })
  })

  test("inactive and missing viewers are refused, including a viewer deactivated after sign-in", async () => {
    const viewer = await member()
    const target = await member()
    await db.update(user).set({ banned: true }).where(eq(user.id, viewer))
    await expect(getMemberProfile(db, viewer, target)).rejects.toBeInstanceOf(InactiveViewerError)
    await expect(listMemberDirectory(db, viewer, {})).rejects.toBeInstanceOf(InactiveViewerError)
    await expect(getMemberProfile(db, "missing", target)).rejects.toBeInstanceOf(InactiveViewerError)
    const active = await member()
    expect(await getMemberProfile(db, active, viewer)).toBeNull()
    expect(await getMemberProfile(db, active, "missing")).toBeNull()
  })

  test("multiple Choirs keep their dates, Sections, assigned Voices and independent capabilities", async () => {
    const singerName = unique("Singer")
    const singer = await member(singerName)
    const kk = await choir("KK")
    const mk = await choir("MK", ["T1", "T2", "B1", "B2"])
    success(await placeSinger(db, { userId: singer, choirId: kk.choirId, voice: "B1", startDate: "2023-08-20" }))
    success(await changeVoice(db, { userId: singer, choirId: kk.choirId, voice: "B2", date: "2026-09-01" }))
    success(await placeSinger(db, { userId: singer, choirId: mk.choirId, voice: "T2", startDate: "2024-08-20" }))
    await setVoiceCapabilities(db, singer, ["B1", "B2", "T1"])
    const committee = success(await createGroup(db, { name: unique("Committee"), type: "Övrig", choirId: kk.choirId }))
    success(await startMembership(db, { userId: singer, groupId: committee.id, startDate: "2025-01-01" }))
    const profile = await getMemberProfile(db, singer, singer)
    expect(profile?.choirs).toHaveLength(2)
    expect(profile?.choirs.find((item) => item.groupId === kk.choirId)).toMatchObject({
      startDate: "2023-08-20",
      section: { voice: "B2", sectionVoice: "B", startDate: "2026-09-01" },
      groups: [{ groupId: committee.id }]
    })
    expect(profile?.capabilities).toEqual(["T1", "B1", "B2"])
    expect(profile?.groups).toEqual([])
    const listing = await listMemberDirectory(db, await member(), { query: singerName })
    expect(listing.members[0].choirs).toHaveLength(2)
    expect(listing.members[0].choirs.find((item) => item.id === kk.choirId)).toMatchObject({ section: "KKB" })
    success(await archiveGroup(db, kk.choirId))
    const afterArchive = await getMemberProfile(db, singer, singer)
    expect(afterArchive?.choirs.map((item) => item.groupId)).toEqual([mk.choirId])
    expect(afterArchive?.otherGroups.map((item) => item.groupId)).toEqual([committee.id])
  })

  test("a Choir member without a Section remains valid", async () => {
    const conductor = await member()
    const kk = await choir("Conductor choir")
    success(await startMembership(db, { userId: conductor, groupId: kk.choirId, startDate: "2020-01-10" }))
    const profile = await getMemberProfile(db, conductor, conductor)
    expect(profile?.choirs[0]).toMatchObject({ groupId: kk.choirId, section: null, startDate: "2020-01-10" })
  })

  test("Positions retain both Group contexts, omit ended holdings and exclude archived Groups", async () => {
    const holder = await member()
    const board = success(await createGroup(db, { name: unique("Styret"), type: "Board" }))
    const sexmasteri = success(await createGroup(db, { name: unique("Sexmästeriet"), type: "Sexmästeri" }))
    const position = success(
      await createPosition(db, { name: unique("Sexmästare"), groupTypes: ["Board", "Sexmästeri"] })
    )
    const ended = success(await createPosition(db, { name: unique("Former position"), groupTypes: ["Board"] }))
    success(await startMembership(db, { userId: holder, groupId: board.id, startDate: "2025-01-01" }))
    success(
      await startPositionHolding(db, {
        userId: holder,
        positionId: ended.id,
        groupId: board.id,
        startDate: "2025-01-01"
      })
    )
    success(
      await endPositionHolding(db, { userId: holder, positionId: ended.id, groupId: board.id, endDate: "2026-01-01" })
    )
    success(
      await startLinkedPosition(db, {
        userId: holder,
        positionId: position.id,
        groupIds: [board.id, sexmasteri.id],
        startDate: "2026-01-01"
      })
    )
    const before = await getMemberProfile(db, holder, holder)
    expect(before?.positions).toHaveLength(1)
    expect(before?.positions[0].groups.map((group) => group.id).sort()).toEqual([board.id, sexmasteri.id].sort())
    success(await archiveGroup(db, sexmasteri.id))
    const after = await getMemberProfile(db, holder, holder)
    expect(after?.groups.map((group) => group.groupId)).toEqual([board.id])
    expect(after?.positions[0].groups.map((group) => group.id)).toEqual([board.id])
  })

  test("directory paging is stable, includes unassigned Users, searches username literally and hides the viewer and inactive Users", async () => {
    const token = crypto.randomUUID()
    const viewer = await member(`Directory ${token} 00`)
    const ids = [viewer]
    for (let index = 1; index <= DIRECTORY_PAGE_SIZE + 1; index++)
      ids.push(await member(`Directory ${token} ${String(index).padStart(2, "0")}`))
    const inactive = await member(`Directory ${token} inactive`, { banned: true })
    const first = await listMemberDirectory(db, viewer, { query: token })
    const second = await listMemberDirectory(db, viewer, { query: token, page: 2 })
    expect(first.total).toBe(DIRECTORY_PAGE_SIZE + 1)
    expect(first.members.map((member) => member.id)).toEqual(ids.slice(1, DIRECTORY_PAGE_SIZE + 1))
    expect(second.members.map((member) => member.id)).toEqual(ids.slice(DIRECTORY_PAGE_SIZE + 1))
    expect(first.members[0]).toMatchObject({ id: ids[1], choirs: [] })
    expect(first.members.map((member) => member.id)).not.toContain(viewer)
    expect((await listMemberDirectory(db, viewer, { query: `Directory ${token} 00` })).total).toBe(0)
    expect(first.members[0]).not.toHaveProperty("email")
    expect(first.members[0]).not.toHaveProperty("role")
    expect(first.members.map((member) => member.id)).not.toContain(inactive)
    const literal = await member("Username owner", { username: `unique_${token}` })
    expect(
      (await listMemberDirectory(db, viewer, { query: `unique_${token}` })).members.map((member) => member.id)
    ).toEqual([literal])
    expect((await listMemberDirectory(db, viewer, { query: "%" })).total).toBe(0)
    expect((await listMemberDirectory(db, viewer, { query: token, page: Number.POSITIVE_INFINITY })).page).toBe(1)
    expect((await listMemberDirectory(db, viewer, { query: token, page: 999 })).page).toBe(2)
  })

  test("Direct Conversation lookup reuses only the authenticated pair and never creates history", async () => {
    const first = await member()
    const second = await member()
    const outsider = await member()
    const [created] = await db.insert(conversation).values({ kind: "direct" }).returning({ id: conversation.id })
    const [firstMemberId, secondMemberId] = [first, second].sort()
    await db.insert(directConversation).values({ conversationId: created.id, firstMemberId, secondMemberId })
    expect(await findDirectConversation(db, first, second)).toBe(created.id)
    expect(await findDirectConversation(db, second, first)).toBe(created.id)
    expect(await findDirectConversation(db, outsider, second)).toBeNull()
    expect(await findDirectConversation(db, first, first)).toBeNull()
    expect(await db.select({ count: count() }).from(conversation)).toEqual([{ count: 1 }])
    await db.update(user).set({ banned: true }).where(eq(user.id, second))
    expect(await findDirectConversation(db, first, second)).toBeNull()
  })
})
