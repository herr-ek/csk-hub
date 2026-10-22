import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { appointmentGrant, directMembership, group, positionAppointment, section } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, GroupType, POSITION_DEFINITIONS, PositionCode, periodsCoverPeriod } from "@/core/org-structure"
import { referenceChoirId, SEED_USERS, type SeedDatabase, seedId } from "./seed-data"

const CURRENT_YEAR = 2026

/** Add only stable demo records. Deterministic IDs make reruns additive and preserve manual edits. */
export async function seedGroupActivity(database: SeedDatabase): Promise<void> {
  const groups = await database.select().from(group)
  const choirs = (["MK", "DK", "KK"] as const)
    .map((name) => ({ id: referenceChoirId(name), name }))
    .filter(({ id }) => groups.some((row) => row.id === id && row.type === GroupType.Choir && row.active))
  const singers = await database
    .select({ id: user.id })
    .from(user)
    .where(
      inArray(
        user.id,
        SEED_USERS.map(({ id }) => id)
      )
    )
    .then((rows) => rows.map(({ id }) => id))
  if (choirs.length !== 3 || singers.length < 24) return

  const byId = new Map(groups.map((row) => [row.id, row]))
  const annual = (type: GroupType, year: number) => {
    const match = groups.filter((row) => row.type === type && row.organisationYear === year)
    if (match.length !== 1) throw new Error(`Expected one ${type} Group for ${year}/${year + 1}.`)
    const row = match[0]
    if (!row) throw new Error(`Missing ${type} Group for ${year}/${year + 1}.`)
    return row
  }
  const singerAt = (index: number) => {
    const singer = singers[index]
    if (!singer) throw new Error(`At least ${index + 1} seeded singers are required.`)
    return singer
  }
  const continuing = groups.find((row) => row.type === GroupType.ParentsMeeting)
  if (!continuing) throw new Error("Föräldramötet is missing; run `bun run ops reference-data` first.")

  const addDirect = async (key: string, userId: string, groupId: string, startDate: string, endDate: string | null) => {
    const id = seedId(`direct:${key}`)
    const [existing] = await database.select().from(directMembership).where(eq(directMembership.id, id))
    if (existing) return
    await database.insert(directMembership).values({ id, userId, groupId, startDate, endDate })
  }
  const memberAt = async (userId: string, groupId: string, startDate: string, endDate: string | null) => {
    const periods = await database
      .select({ startDate: directMembership.startDate, endDate: directMembership.endDate })
      .from(directMembership)
      .where(
        and(
          eq(directMembership.userId, userId),
          eq(directMembership.groupId, groupId),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, startDate)),
          endDate === null ? undefined : lt(directMembership.startDate, endDate)
        )
      )
    return periodsCoverPeriod(periods, { startDate, endDate })
  }
  const memberOf = async (groupId: string, date: string, offset: number) => {
    const rows = await database
      .select({ userId: directMembership.userId })
      .from(directMembership)
      .where(eq(directMembership.groupId, groupId))
    const candidates = [...new Set(rows.map(({ userId }) => userId))].sort()
    for (let index = 0; index < candidates.length; index++) {
      const userId = candidates[(index + offset) % candidates.length]
      if (userId && (await memberAt(userId, groupId, date, null))) return userId
    }
    throw new Error(`No Member can cover a seeded appointment in Group ${groupId} from ${date}.`)
  }
  const appoint = async (
    key: string,
    userId: string,
    code: PositionCode,
    contextGroupId: string,
    year: number | null,
    startDate: string,
    endDate: string | null,
    grantIds: string[]
  ) => {
    const id = seedId(`appointment:${key}`)
    const [existing] = await database.select().from(positionAppointment).where(eq(positionAppointment.id, id))
    if (existing) return
    const definition = POSITION_DEFINITIONS[code]
    const context = byId.get(contextGroupId)
    if (!context || context.type !== definition.context) throw new Error(`Invalid context for ${code}.`)
    if (
      definition.endPolicy === "annual" &&
      GROUP_POLICIES[context.type].lifetime === "annual" &&
      context.organisationYear !== year
    )
      throw new Error(`The ${code} context must match its explicit organisational year.`)
    if (definition.prerequisite && !(await memberAt(userId, contextGroupId, startDate, endDate)))
      throw new Error(`The ${code} holder must be a Member of its context for the full appointment.`)
    if (definition.endPolicy === "annual") {
      if (
        year === null ||
        startDate < `${year}-07-01` ||
        startDate >= `${year + 1}-07-01` ||
        endDate === null ||
        endDate > `${year + 1}-07-01` ||
        endDate <= startDate
      )
        throw new Error(`The ${code} appointment must fit its explicit organisational year.`)
    } else if (year !== null) throw new Error(`Fluid ${code} appointments have no organisational year.`)
    await database.insert(positionAppointment).values({
      id,
      userId,
      positionCode: code,
      contextGroupId,
      organisationYear: year,
      startDate,
      endDate
    })
    const expectedTypes = new Set(definition.grants)
    const actualTypes = new Set(grantIds.map((groupId) => byId.get(groupId)?.type))
    if (grantIds.length !== expectedTypes.size || [...expectedTypes].some((type) => !actualTypes.has(type)))
      throw new Error(`Missing or duplicate grant Group for ${code}.`)
    for (const groupId of grantIds) {
      const target = byId.get(groupId)
      if (!target) throw new Error(`Unknown grant Group ${groupId}.`)
      const policy = GROUP_POLICIES[target.type]
      if (policy.lifetime === "annual" && target.organisationYear !== year)
        throw new Error(`The ${code} grant must target the same organisational year.`)
    }
    if (grantIds.length)
      await database.insert(appointmentGrant).values(grantIds.map((groupId) => ({ appointmentId: id, groupId })))
  }

  const board = annual(GroupType.Board, CURRENT_YEAR)
  const roleGroups = new Map<PositionCode, string[]>([
    [PositionCode.Chair, [board.id]],
    [PositionCode.Treasurer, [board.id]],
    [PositionCode.Secretary, [board.id, continuing.id]],
    [PositionCode.PublicRelationsOfficer, [board.id]],
    [PositionCode.FirstConcertMaster, [board.id, annual(GroupType.ConcertCommittee, CURRENT_YEAR).id]],
    [PositionCode.OrganisationGigCoordinator, [board.id, annual(GroupType.GigCommittee, CURRENT_YEAR).id]],
    [PositionCode.SocialCoordinator, [board.id, annual(GroupType.SocialCommittee, CURRENT_YEAR).id]]
  ])
  await appoint(
    "board-26-ordforande-handover-old",
    singerAt(15),
    PositionCode.Chair,
    board.id,
    CURRENT_YEAR,
    "2026-07-01",
    "2026-09-01",
    [board.id]
  )
  for (const [index, [code, grants]] of [...roleGroups].entries()) {
    const userId = singerAt(index + 1)
    if (code === PositionCode.SocialCoordinator) {
      const committee = annual(GroupType.SocialCommittee, CURRENT_YEAR)
      await addDirect("sexmastere-helper-before", userId, committee.id, "2026-07-01", "2026-09-01")
      await appoint(`board-26-${code}`, userId, code, board.id, CURRENT_YEAR, "2026-09-01", "2027-01-01", grants)
      await addDirect("sexmastere-helper-after", userId, committee.id, "2027-01-01", "2027-07-01")
      continue
    }
    await appoint(
      `board-26-${code}`,
      userId,
      code,
      board.id,
      CURRENT_YEAR,
      code === PositionCode.Chair ? "2026-09-01" : "2026-07-01",
      "2027-07-01",
      grants
    )
  }
  await appoint(
    "board-27-ordforande-renewal",
    singerAt(1),
    PositionCode.Chair,
    annual(GroupType.Board, CURRENT_YEAR + 1).id,
    CURRENT_YEAR + 1,
    "2027-07-01",
    "2028-07-01",
    [annual(GroupType.Board, CURRENT_YEAR + 1).id]
  )

  const sexmästeri = annual(GroupType.SocialCommittee, CURRENT_YEAR)
  await appoint(
    "sexmastarinna-26",
    singerAt(10),
    PositionCode.DeputySocialCoordinator,
    sexmästeri.id,
    CURRENT_YEAR,
    "2026-07-01",
    "2027-07-01",
    [sexmästeri.id]
  )
  const turne = annual(GroupType.TourCommittee, CURRENT_YEAR)
  await appoint(
    "ekonomiskt-ansvarig-turne-26",
    singerAt(11),
    PositionCode.FinancialOfficer,
    turne.id,
    CURRENT_YEAR,
    "2026-07-01",
    "2027-07-01",
    [turne.id]
  )

  // Each Choir has independent representatives. They retain their Choir Membership and are
  // granted the same annual committee Group; choir suffixes never create separate Position codes.
  for (const [index, choir] of choirs.entries()) {
    const choirMember = await memberOf(choir.id, "2026-07-01", index)
    const otherChoirMember = await memberOf(choir.id, "2026-07-01", index + 1)
    await appoint(
      `choir-konsert-${choir.name}-26`,
      choirMember,
      PositionCode.ChoirConcertMaster,
      choir.id,
      CURRENT_YEAR,
      "2026-07-01",
      "2027-07-01",
      [annual(GroupType.ConcertCommittee, CURRENT_YEAR).id]
    )
    await appoint(
      `choir-gig-${choir.name}-26`,
      otherChoirMember,
      PositionCode.ChoirGigCoordinator,
      choir.id,
      CURRENT_YEAR,
      "2026-07-01",
      "2027-07-01",
      [annual(GroupType.GigCommittee, CURRENT_YEAR).id]
    )
    const formerDirigent = await memberOf(choir.id, "2025-09-01", index + 2)
    await appoint(
      `choir-dirigent-handover-${choir.name}-old`,
      formerDirigent,
      PositionCode.Conductor,
      choir.id,
      null,
      "2025-09-01",
      "2026-07-01",
      []
    )
    await appoint(
      `choir-dirigent-${choir.name}`,
      choirMember,
      PositionCode.Conductor,
      choir.id,
      null,
      "2026-07-01",
      null,
      []
    )
    await appoint(
      `choir-notfiskal-${choir.name}`,
      otherChoirMember,
      PositionCode.MusicLibrarian,
      choir.id,
      null,
      "2026-07-01",
      null,
      []
    )
  }

  // Three Section leaders demonstrate fluid responsibility while singer Membership and Voice stay intact.
  const sections = await database
    .select({ id: group.id })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .where(eq(group.active, true))

  for (const [index, row] of sections.entries()) {
    const userId = await memberOf(row.id, "2026-07-01", index)
    await appoint(`stamforalder-${row.id}`, userId, PositionCode.SectionParent, row.id, null, "2026-07-01", null, [
      continuing.id
    ])
  }

  // Direct Helpers have explicit Memberships without fabricated Position titles.
  for (const [index, type] of (
    [GroupType.NominationCommittee, GroupType.WebTeam, GroupType.Archives, GroupType.MemorisationCommittee] as const
  ).entries()) {
    const target = annual(type, CURRENT_YEAR)
    for (const userId of singers.slice(40 + index * 2, 42 + index * 2))
      await addDirect(`helper-${target.id}-${userId}`, userId, target.id, "2026-07-01", "2027-07-01")
  }

  const seededGigGroupId = seedId("example-group:GigGroup:Giggrupp vår:csk")
  const gigGroup =
    groups.find((row) => row.id === seededGigGroupId) ??
    groups.find((row) => row.type === GroupType.GigGroup && row.name === "Giggrupp vår" && row.active)
  if (gigGroup) {
    const gigLeader = singerAt(60)
    await addDirect("gigleader-prerequisite", gigLeader, gigGroup.id, "2026-07-01", null)
    await appoint(
      `gigleader-${gigGroup.id}`,
      gigLeader,
      PositionCode.GigLeader,
      gigGroup.id,
      null,
      "2026-07-01",
      null,
      []
    )
  }
}
