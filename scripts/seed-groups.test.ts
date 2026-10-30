import { afterAll, describe, expect, test } from "bun:test"
import { and, eq, isNull } from "drizzle-orm"
import { Client } from "pg"
import { user } from "@/core/db/schema/auth"
import { directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { appointmentMemberships } from "@/features/org-structure/appointment-memberships"
import {
  correctAnnualAppointment,
  correctFluidAppointment,
  createOrganisationGroup
} from "@/features/org-structure/appointments"
import { addDirectMembership, correctDirectMembership } from "@/features/org-structure/direct-membership"
import { renameGroup } from "@/features/org-structure/structure"
import { createTestDatabase } from "../test/database"
import { insertReferenceData } from "./ops/reference-data"
import {
  DEMO_ORGANISATION_YEAR,
  referenceChoirId,
  referenceContinuingGroupId,
  referenceSectionId,
  SEED_USERS,
  seedId
} from "./ops/seed-data"
import { seedGroups } from "./seed-groups"
import { seedUsers } from "./seed-users"

const database = await createTestDatabase()

describe.skipIf(!database)("seedGroups", () => {
  if (!database) return
  const t = database as NonNullable<typeof database>
  const derivedMembership = appointmentMemberships(t.db)
  afterAll(() => t.drop())

  async function newUser() {
    const id = crypto.randomUUID()
    await t.db.insert(user).values({ id, name: "Singer", email: `${id}@example.com` })
    return id
  }

  test("refuses to run before the reference data exists", async () => {
    await expect(seedGroups(t.db)).rejects.toThrow("bun run ops reference-data")
  })

  test("adds the example groups and places every unplaced user in a Choir and a Section, once", async () => {
    const client = new Client({ connectionString: t.url })
    await client.connect()
    await insertReferenceData(client, DEMO_ORGANISATION_YEAR)
    await client.end()
    const users = [await newUser(), await newUser()]

    const { created, placed } = await seedGroups(t.db)
    expect(created).toContain("KK:EquipmentTeam")
    expect(created).not.toContain("fixed annual Groups and stable appointment examples")
    expect(placed).toBe(2)

    for (const userId of users) {
      const rows = await t.db
        .select({ type: group.type, voice: directMembership.voice })
        .from(directMembership)
        .innerJoin(group, eq(group.id, directMembership.groupId))
        .where(and(eq(directMembership.userId, userId), isNull(directMembership.endDate)))
      expect(rows.map(({ type }) => type).sort()).toEqual([GroupType.Choir, GroupType.Section])
      // Every seeded singer gets a division, even in a Section that sings a whole family.
      expect(rows.find(({ type }) => type === GroupType.Section)?.voice).toMatch(/^[SATB][12]$/)
    }

    expect(await seedGroups(t.db)).toEqual({ created: [], placed: 0 })
  })

  test("reruns preserve public corrections to seeded placements and appointments", async () => {
    await seedUsers(t.db)
    await seedGroups(t.db)

    const seededUserId = SEED_USERS[0]?.id
    if (!seededUserId) throw new Error("Missing seeded singer")
    const [placement] = await t.db
      .select({ membership: directMembership, voice: section.voice })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .innerJoin(section, eq(section.groupId, group.id))
      .where(and(eq(directMembership.userId, seededUserId), eq(group.type, GroupType.Section)))
    if (!placement) throw new Error("Missing seeded Section Membership")
    const correctedStart = "2021-09-01"
    const correctedVoice = placement.voice.length === 1 ? `${placement.voice}2` : placement.voice
    const correction = await correctDirectMembership(t.db, {
      membershipId: placement.membership.id,
      groupId: placement.membership.groupId,
      startDate: correctedStart,
      endDate: placement.membership.endDate,
      voice: correctedVoice as typeof placement.membership.voice
    })
    expect(correction.success).toBe(true)

    const appointmentId = seedId("appointment:board-26-ordforande")
    const [appointment] = await t.db.select().from(positionAppointment).where(eq(positionAppointment.id, appointmentId))
    if (!appointment) throw new Error("Missing seeded Board appointment")
    const holderCorrection = await correctAnnualAppointment(t.db, {
      appointmentId,
      userId: SEED_USERS[99]?.id as string,
      positionCode: PositionCode.Chair,
      contextGroupId: appointment.contextGroupId,
      organisationYear: 2026,
      startDate: "2026-09-01",
      endDate: "2027-07-01"
    })
    expect(holderCorrection.success).toBe(true)

    const [gigGroup] = await t.db.select().from(group).where(eq(group.name, "Giggrupp vår"))
    if (!gigGroup) throw new Error("Missing seeded GigGroup")
    const gigAppointmentId = seedId(`appointment:gigleader-${gigGroup.id}`)
    const [gigAppointment] = await t.db
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, gigAppointmentId))
    if (!gigAppointment) throw new Error("Missing seeded Gigledare appointment")
    const alternate = await createOrganisationGroup(
      t.db,
      {
        name: `Edited GigGroup ${crypto.randomUUID()}`,
        type: GroupType.GigGroup
      },
      "4000-10-22"
    )
    if (!alternate.success) throw new Error(`Could not create alternate GigGroup: ${alternate.error}`)
    expect(
      await addDirectMembership(t.db, {
        userId: gigAppointment.userId,
        groupId: alternate.data.id,
        startDate: "2026-07-01"
      })
    ).toMatchObject({ success: true })
    expect(
      await correctFluidAppointment(t.db, {
        appointmentId: gigAppointmentId,
        userId: gigAppointment.userId,
        positionCode: PositionCode.GigLeader,
        contextGroupId: alternate.data.id,
        startDate: "2026-07-01",
        endDate: null
      })
    ).toMatchObject({ success: true })

    const beforeRerunMemberships = await t.db.select().from(directMembership)
    const beforeRerunAppointments = await t.db.select().from(positionAppointment)
    const beforeRerunGroups = await t.db.select().from(group)
    await seedGroups(t.db)
    expect(await t.db.select().from(directMembership)).toEqual(beforeRerunMemberships)
    expect(await t.db.select().from(positionAppointment)).toEqual(beforeRerunAppointments)
    expect(await t.db.select().from(group)).toEqual(beforeRerunGroups)

    const [preservedMembership] = await t.db
      .select()
      .from(directMembership)
      .where(eq(directMembership.id, placement.membership.id))
    expect(preservedMembership).toMatchObject({
      id: placement.membership.id,
      startDate: correctedStart,
      voice: correctedVoice
    })
    const [preservedAppointment] = await t.db
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, appointmentId))
    expect(preservedAppointment).toMatchObject({
      userId: SEED_USERS[99]?.id,
      contextGroupId: appointment.contextGroupId,
      startDate: "2026-09-01"
    })
    const [preservedGigAppointment] = await t.db
      .select()
      .from(positionAppointment)
      .where(eq(positionAppointment.id, gigAppointmentId))
    expect(preservedGigAppointment).toMatchObject({
      userId: gigAppointment.userId,
      contextGroupId: alternate.data.id,
      startDate: gigAppointment.startDate,
      endDate: gigAppointment.endDate
    })
  })

  test("reference and demo reruns preserve renamed Choir, Section, and continuing Group identities", async () => {
    await seedUsers(t.db)
    const client = new Client({ connectionString: t.url })
    await client.connect()
    try {
      await insertReferenceData(client, DEMO_ORGANISATION_YEAR)
    } finally {
      await client.end()
    }
    await seedGroups(t.db)

    const [choir] = await t.db
      .select()
      .from(group)
      .where(and(eq(group.name, "DK"), eq(group.type, GroupType.Choir)))
    const [sectionRow] = await t.db
      .select()
      .from(group)
      .where(and(eq(group.name, "DKS1"), eq(group.type, GroupType.Section)))
    const [continuing] = await t.db.select().from(group).where(eq(group.type, GroupType.ParentsMeeting))
    if (!choir || !sectionRow || !continuing) throw new Error("Missing reference Groups")
    expect(choir.id).toBe(referenceChoirId("DK"))
    expect(sectionRow.id).toBe(referenceSectionId("DK", "DKS1"))
    expect(continuing.id).toBe(referenceContinuingGroupId(GroupType.ParentsMeeting))
    expect((await renameGroup(t.db, choir.id, "Edited DK")).success).toBe(true)
    expect((await renameGroup(t.db, sectionRow.id, "Edited DKS1")).success).toBe(true)
    expect(await renameGroup(t.db, continuing.id, "Edited Parents Meeting")).toEqual({
      success: false,
      error: "group-name-derived"
    })

    const groupsBefore = await t.db.select().from(group)
    const membershipsBefore = await t.db.select().from(directMembership)
    const appointmentsBefore = await t.db.select().from(positionAppointment)
    const grantsBefore = await t.db
      .select()
      .from(derivedMembership)
      .orderBy(derivedMembership.appointmentId, derivedMembership.groupId)
    const sectionsBefore = await t.db.select().from(section)
    const clientAgain = new Client({ connectionString: t.url })
    await clientAgain.connect()
    try {
      expect(await insertReferenceData(clientAgain)).toEqual([])
    } finally {
      await clientAgain.end()
    }
    const rerun = await seedGroups(t.db)
    expect(rerun.created).toEqual([])
    expect(await t.db.select().from(group)).toEqual(groupsBefore)
    expect(await t.db.select().from(directMembership)).toEqual(membershipsBefore)
    expect(await t.db.select().from(positionAppointment)).toEqual(appointmentsBefore)
    expect(
      await t.db.select().from(derivedMembership).orderBy(derivedMembership.appointmentId, derivedMembership.groupId)
    ).toEqual(grantsBefore)
    expect(await t.db.select().from(section)).toEqual(sectionsBefore)
    expect(await t.db.select().from(group).where(eq(group.id, choir.id))).toMatchObject([
      expect.objectContaining({ name: "Edited DK", type: GroupType.Choir })
    ])
    expect(await t.db.select().from(group).where(eq(group.id, sectionRow.id))).toMatchObject([
      expect.objectContaining({ name: "Edited DKS1", type: GroupType.Section, choirId: choir.id })
    ])
    expect(await t.db.select().from(group).where(eq(group.id, continuing.id))).toMatchObject([
      expect.objectContaining({ name: null, type: GroupType.ParentsMeeting })
    ])
  })
})
