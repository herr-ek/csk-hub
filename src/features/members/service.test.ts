import { afterAll, describe, expect, test } from "bun:test"
import { count, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { conversation, directConversation } from "@/core/db/schema/messaging"
import type { OrgStructureResult } from "@/core/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { findDirectConversation } from "@/features/messaging/reading"
import {
  addDirectMembership,
  appointPosition,
  archiveGroup,
  changeVoice,
  correctAnnualAppointment,
  createChoir,
  createOrganisationGroup,
  endAppointment,
  endDirectMembership,
  listAppointmentsForGroup,
  listCurrentGroupMembers,
  listDirectMemberships,
  placeSinger,
  startMembership
} from "@/features/org-structure"
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
    const committee = success(
      await createOrganisationGroup(
        db,
        { name: unique("Crew"), type: GroupType.EquipmentTeam, choirId: kk.choirId },
        "4000-10-22"
      )
    )
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

  test("one appointment grants both Group contexts and expires as a single responsibility", async () => {
    const holder = await member()
    const board = success(
      await createOrganisationGroup(
        db,
        { name: unique("Styret 25/26"), type: GroupType.Board, organisationYear: 2025 },
        "4000-10-22"
      )
    )
    const sexmasteri = success(
      await createOrganisationGroup(
        db,
        {
          name: unique("Sexmästeriet 25/26"),
          type: GroupType.SocialCommittee,
          organisationYear: 2025
        },
        "4000-10-22"
      )
    )
    const appointment = success(
      await appointPosition(db, {
        userId: holder,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board.id,
        startDate: "2025-07-01"
      })
    )
    const before = await getMemberProfile(db, holder, holder, "2025-08-01")
    expect(before?.positions).toMatchObject([{ id: appointment.id, positionCode: PositionCode.SocialCoordinator }])
    expect(before?.positions[0].groups.map((group) => group.id).sort()).toEqual([board.id, sexmasteri.id].sort())
    success(await endAppointment(db, { appointmentId: appointment.id, endDate: "2026-07-01" }))
    const after = await getMemberProfile(db, holder, holder, "2026-07-01")
    expect(after?.groups).toEqual([])
    expect(after?.positions).toEqual([])
  })

  test("effective profile affiliations show one dated appointment across grants without enrolling a singer", async () => {
    const holder = await member("Appointed without Choir")
    const boardName = unique("Board 26/27")
    const board = success(
      await createOrganisationGroup(
        db,
        { name: boardName, type: GroupType.Board, organisationYear: 2026 },
        "4000-10-22"
      )
    )
    const sexName = unique("Sexmästeri 26/27")
    const sex = success(
      await createOrganisationGroup(
        db,
        {
          name: sexName,
          type: GroupType.SocialCommittee,
          organisationYear: 2026
        },
        "4000-10-22"
      )
    )
    const appointment = success(
      await appointPosition(db, {
        userId: holder,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board.id,
        startDate: "2026-07-01"
      })
    )
    const second = success(
      await appointPosition(db, {
        userId: holder,
        positionCode: PositionCode.DeputySocialCoordinator,
        contextGroupId: sex.id,
        startDate: "2026-07-01"
      })
    )
    const profile = await getMemberProfile(db, holder, holder, "2026-08-01")
    expect(profile?.choirs).toEqual([])
    expect(profile?.positions.map((item) => item.id).sort()).toEqual([appointment.id, second.id].sort())
    expect(profile?.positions.map((item) => item.contextGroupId).sort()).toEqual([board.id, sex.id].sort())
    expect(profile?.positions.map((item) => item.contextName)).toEqual([null, null])
    expect(profile?.groups.map((item) => item.groupId).sort()).toEqual([board.id, sex.id].sort())
    expect(profile?.groups.find((item) => item.groupId === sex.id)?.positions).toHaveLength(2)
    expect(await listCurrentGroupMembers(db, board.id)).toMatchObject([{ userId: holder, startDate: "2026-07-01" }])
    const future = await getMemberProfile(db, holder, holder, "2026-06-30")
    expect(future?.positions).toEqual([])
    expect(future?.groups).toEqual([])
    const expired = await getMemberProfile(db, holder, holder, "2027-07-01")
    expect(expired?.positions).toEqual([])
    expect(expired?.groups).toEqual([])
    const finalJuneDay = await getMemberProfile(db, holder, holder, "2027-06-30")
    expect(finalJuneDay?.positions.map((item) => item.id)).toEqual([appointment.id, second.id])
    expect(finalJuneDay?.groups.map((item) => item.groupId).sort()).toEqual([board.id, sex.id].sort())
  })

  test("same-code Choir appointments keep independent contexts and IDs", async () => {
    const singer = await member("Two Choir appointments")
    const mk = await choir("MK representatives")
    const kk = await choir("KK representatives")
    const concert = success(
      await createOrganisationGroup(
        db,
        {
          name: unique("Konsertmästeri 26/27"),
          type: GroupType.ConcertCommittee,
          organisationYear: 2026
        },
        "4000-10-22"
      )
    )
    success(await placeSinger(db, { userId: singer, choirId: mk.choirId, voice: "B1", startDate: "2026-07-01" }))
    success(await placeSinger(db, { userId: singer, choirId: kk.choirId, voice: "S1", startDate: "2026-07-01" }))
    const first = success(
      await appointPosition(db, {
        userId: singer,
        positionCode: PositionCode.ChoirConcertMaster,
        contextGroupId: mk.choirId,
        startDate: "2026-07-01",
        organisationYear: 2026
      })
    )
    const second = success(
      await appointPosition(db, {
        userId: singer,
        positionCode: PositionCode.ChoirConcertMaster,
        contextGroupId: kk.choirId,
        startDate: "2026-07-01",
        organisationYear: 2026
      })
    )
    const profile = await getMemberProfile(db, singer, singer, "2026-08-01")
    expect(
      profile?.positions
        .filter((item) => item.positionCode === PositionCode.ChoirConcertMaster)
        .map((item) => item.id)
        .sort()
    ).toEqual([first.id, second.id].sort())
    expect(
      profile?.positions
        .filter((item) => item.positionCode === PositionCode.ChoirConcertMaster)
        .map((item) => item.contextGroupId)
        .sort()
    ).toEqual([kk.choirId, mk.choirId].sort())
    expect(profile?.groups.find((item) => item.groupId === concert.id)?.positions).toHaveLength(2)
  })

  test("corrected holder and annual context appear through the same dated profile read", async () => {
    const predecessor = await member("Predecessor")
    const successor = await member("Successor")
    const year = 2500 + Math.floor(Math.random() * 1_000)
    const yearAfter = year + 1
    const startDate = `${year}-07-01`
    const correctionDate = `${yearAfter}-07-01`
    const readDate = `${yearAfter}-08-01`
    const endDate = `${yearAfter + 1}-07-01`
    const board26 = success(
      await createOrganisationGroup(
        db,
        {
          name: unique(`Board ${year}/${yearAfter} correction`),
          type: GroupType.Board,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const board27 = success(
      await createOrganisationGroup(
        db,
        {
          name: unique(`Board ${yearAfter}/${yearAfter + 1} correction`),
          type: GroupType.Board,
          organisationYear: yearAfter
        },
        "4000-10-22"
      )
    )
    const sex26 = success(
      await createOrganisationGroup(
        db,
        {
          name: unique(`Sex ${year}/${yearAfter} correction`),
          type: GroupType.SocialCommittee,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const sex27 = success(
      await createOrganisationGroup(
        db,
        {
          name: unique(`Sex ${yearAfter}/${yearAfter + 1} correction`),
          type: GroupType.SocialCommittee,
          organisationYear: yearAfter
        },
        "4000-10-22"
      )
    )
    const appointment = success(
      await appointPosition(db, {
        userId: predecessor,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board26.id,
        startDate
      })
    )
    success(
      await correctAnnualAppointment(db, {
        appointmentId: appointment.id,
        userId: successor,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board27.id,
        organisationYear: yearAfter,
        startDate: correctionDate,
        endDate
      })
    )
    expect((await getMemberProfile(db, predecessor, predecessor, readDate))?.positions).toEqual([])
    const corrected = await getMemberProfile(db, successor, successor, readDate)
    expect(corrected?.positions).toMatchObject([
      { id: appointment.id, contextGroupId: board27.id, organisationYear: yearAfter }
    ])
    expect(corrected?.groups.map((item) => item.groupId).sort()).toEqual([board27.id, sex27.id].sort())
    expect(corrected?.groups.map((item) => item.groupId)).not.toContain(sex26.id)
  })

  test("archiving an ensemble hides its affiliations without ending memberships or leadership", async () => {
    const singer = await member("Archived ensemble leader")
    const ensemble = success(
      await createOrganisationGroup(db, { name: unique("Retired ensemble"), type: GroupType.GigGroup })
    )
    success(await addDirectMembership(db, { userId: singer, groupId: ensemble.id, startDate: "2020-01-01" }))
    success(
      await appointPosition(db, {
        userId: singer,
        positionCode: PositionCode.GigLeader,
        contextGroupId: ensemble.id,
        startDate: "2020-02-01"
      })
    )
    const memberships = await listDirectMemberships(db, ensemble.id)
    const appointments = await listAppointmentsForGroup(db, ensemble.id)
    expect((await getMemberProfile(db, singer, singer))?.groups).toHaveLength(1)
    success(await archiveGroup(db, ensemble.id))
    expect(await listDirectMemberships(db, ensemble.id)).toEqual(memberships)
    expect(await listAppointmentsForGroup(db, ensemble.id)).toEqual(appointments)
    expect(await listCurrentGroupMembers(db, ensemble.id)).toMatchObject([{ userId: singer }])
    expect(await getMemberProfile(db, singer, singer)).toMatchObject({ groups: [], positions: [] })
    expect(
      await addDirectMembership(db, { userId: await member(), groupId: ensemble.id, startDate: "2026-10-22" })
    ).toEqual({ success: false, error: "group-archived" })
  })

  test("adjacent direct periods use one exclusive handover boundary", async () => {
    const singer = await member("Adjacent periods")
    const group = success(
      await createOrganisationGroup(db, { name: unique("Fluid participation"), type: GroupType.Other }, "4000-10-22")
    )
    const predecessor = success(
      await addDirectMembership(db, { userId: singer, groupId: group.id, startDate: "2026-01-01" })
    )
    success(await endDirectMembership(db, { membershipId: predecessor.id, endDate: "2026-08-01" }))
    const successor = success(
      await addDirectMembership(db, { userId: singer, groupId: group.id, startDate: "2026-08-01" })
    )
    const before = await getMemberProfile(db, singer, singer, "2026-07-31")
    const boundary = await getMemberProfile(db, singer, singer, "2026-08-01")
    expect(before?.groups[0].membershipPeriods.map((period) => period.id)).toEqual([predecessor.id])
    expect(boundary?.groups[0].membershipPeriods.map((period) => period.id)).toEqual([successor.id])
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

  test("Direct Conversation lookup reuses only the requested pair and never creates history", async () => {
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
  })
})
