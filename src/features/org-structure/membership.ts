import "server-only"

import { and, eq, gt, gte, inArray, isNull, or } from "drizzle-orm"
import { group, groupMember, section } from "@/core/db/schema/org-structure"
import { contains, familyOf, type Voice } from "@/features/voice/model"
import { findCurrentMembership, requireActiveGroup, requireChoir, requireGroup } from "./lookup"
import type { IsoDate } from "./model"
import {
  lockUser,
  type OrgStructureDatabase,
  type OrgStructureTransaction,
  RuleViolation,
  requireDate,
  runOrgStructureCommand
} from "./operation"
import { endHoldingsInGroups } from "./positions"

type StartMembershipInput = { userId: string; groupId: string; startDate: IsoDate }

/**
 * Starts a Membership in any group but a Section. Joining a group that belongs to a Choir also
 * starts a Membership in that Choir when the user has none.
 */
export function startMembership(database: OrgStructureDatabase, input: StartMembershipInput) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    await lockUser(tx, input.userId)
    await addMembership(tx, input.userId, input.groupId, startDate)
  })
}

/**
 * Starts a Membership for a user already locked by the caller. Shared with commands that make
 * someone a member as one step of a larger change.
 */
export async function addMembership(tx: OrgStructureTransaction, userId: string, groupId: string, startDate: IsoDate) {
  const row = await requireActiveGroup(tx, groupId)
  if (row.type === "Section") throw new RuleViolation("section-requires-placement")
  if (row.choirId) await ensureChoirMembership(tx, userId, row.choirId, startDate)
  await insertMembership(tx, { userId, groupId, startDate, voice: null })
}

type PlaceSingerInput = { userId: string; choirId: string; voice: Voice; startDate: IsoDate }

/**
 * Places a singer in a Choir, in the Section whose Voice contains theirs: B1 in KK goes to KKB,
 * which sings B. The Sections of a Choir never overlap, so the Voice decides the Section. A family
 * is a valid Voice for a singer not yet placed in a division (B in KKB), but not where the Choir
 * divides it (B in MK).
 */
export function placeSinger(database: OrgStructureDatabase, input: PlaceSingerInput) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    await requireChoir(tx, input.choirId)
    await lockUser(tx, input.userId)
    return addSinger(tx, input, startDate)
  })
}

type PlaceSingerInSectionInput = { userId: string; sectionId: string; voice: Voice; startDate: IsoDate }

/** Places a singer in a given Section, refusing a Voice that Section does not sing. */
export function placeSingerInSection(database: OrgStructureDatabase, input: PlaceSingerInSectionInput) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    const sectionGroup = await requireActiveGroup(tx, input.sectionId)
    if (sectionGroup.type !== "Section" || !sectionGroup.choirId) throw new RuleViolation("group-not-found")
    const [sung] = await tx.select({ voice: section.voice }).from(section).where(eq(section.groupId, input.sectionId))
    if (!sung || !contains(sung.voice, input.voice)) throw new RuleViolation("voice-not-sung-in-section")

    await lockUser(tx, input.userId)
    return addSinger(tx, { userId: input.userId, choirId: sectionGroup.choirId, voice: input.voice }, startDate)
  })
}

async function addSinger(tx: OrgStructureTransaction, input: Omit<PlaceSingerInput, "startDate">, startDate: IsoDate) {
  if (await findCurrentSectionMembership(tx, input.userId, input.choirId)) {
    throw new RuleViolation("already-in-section")
  }
  const sectionId = await sectionSinging(tx, input.choirId, input.voice)
  await ensureChoirMembership(tx, input.userId, input.choirId, startDate)
  await insertMembership(tx, { userId: input.userId, groupId: sectionId, startDate, voice: input.voice })
  return { sectionId }
}

type ChangeVoiceInput = { userId: string; choirId: string; voice: Voice; date: IsoDate }

/**
 * Changes a singer's Voice in a Choir from `date`. The current Section Membership ends and a new
 * one starts, in the same Section or another; history is never rewritten. Leaving a Section ends
 * the singer's Positions in it, while a change within one Section keeps them.
 */
export function changeVoice(database: OrgStructureDatabase, input: ChangeVoiceInput) {
  return runOrgStructureCommand(database, async (tx) => {
    const date = requireDate(input.date)
    await requireChoir(tx, input.choirId)
    await lockUser(tx, input.userId)

    const current = await findCurrentSectionMembership(tx, input.userId, input.choirId)
    if (!current) throw new RuleViolation("not-a-singer")
    if (current.voice === input.voice) throw new RuleViolation("same-voice")

    const sectionId = await sectionSinging(tx, input.choirId, input.voice)
    await closeMembership(tx, input.userId, current.groupId, date)
    if (sectionId !== current.groupId) await endHoldingsInGroups(tx, input.userId, [current.groupId], date)
    await tx
      .insert(groupMember)
      .values({ userId: input.userId, groupId: sectionId, startDate: date, voice: input.voice })
    return { sectionId }
  })
}

type EndMembershipInput = { userId: string; groupId: string; endDate: IsoDate }

/**
 * Ends a Membership and the user's Positions in that group. Leaving a Choir also ends their
 * Memberships, and Positions, in every group that belongs to it.
 */
export function endMembership(database: OrgStructureDatabase, input: EndMembershipInput) {
  return runOrgStructureCommand(database, async (tx) => {
    const endDate = requireDate(input.endDate)
    const row = await requireGroup(tx, input.groupId)
    await lockUser(tx, input.userId)

    if (!(await findCurrentMembership(tx, input.userId, input.groupId))) throw new RuleViolation("not-a-member")

    const groupIds = [input.groupId]
    if (row.type === "Choir") {
      const choirGroups = await tx
        .select({ groupId: groupMember.groupId })
        .from(groupMember)
        .innerJoin(group, eq(group.id, groupMember.groupId))
        .where(and(eq(groupMember.userId, input.userId), isNull(groupMember.endDate), eq(group.choirId, input.groupId)))
      groupIds.push(...choirGroups.map(({ groupId }) => groupId))
    }

    await endHoldingsInGroups(tx, input.userId, groupIds, endDate)
    for (const groupId of groupIds) await closeMembership(tx, input.userId, groupId, endDate)
  })
}

/** A Membership in a Choir's group requires one in the Choir, so it is started when missing. */
async function ensureChoirMembership(tx: OrgStructureTransaction, userId: string, choirId: string, startDate: IsoDate) {
  const current = await findCurrentMembership(tx, userId, choirId)
  if (!current) {
    await requireActiveGroup(tx, choirId)
    await insertMembership(tx, { userId, groupId: choirId, startDate, voice: null })
  } else if (current.startDate > startDate) {
    // The group Membership would begin before the Choir Membership that it depends on.
    throw new RuleViolation("period-conflict")
  }
}

async function insertMembership(tx: OrgStructureTransaction, membership: typeof groupMember.$inferInsert) {
  if (await findCurrentMembership(tx, membership.userId, membership.groupId)) throw new RuleViolation("already-member")

  // A new period starts no earlier than the end of every earlier period in the same group.
  const [overlap] = await tx
    .select({ startDate: groupMember.startDate })
    .from(groupMember)
    .where(
      and(
        eq(groupMember.userId, membership.userId),
        eq(groupMember.groupId, membership.groupId),
        or(gte(groupMember.startDate, membership.startDate), gt(groupMember.endDate, membership.startDate))
      )
    )
    .limit(1)
  if (overlap) throw new RuleViolation("period-conflict")

  await tx.insert(groupMember).values(membership)
}

async function closeMembership(tx: OrgStructureTransaction, userId: string, groupId: string, endDate: IsoDate) {
  await tx
    .update(groupMember)
    .set({ endDate })
    .where(and(eq(groupMember.userId, userId), eq(groupMember.groupId, groupId), isNull(groupMember.endDate)))
}

async function findCurrentSectionMembership(tx: OrgStructureTransaction, userId: string, choirId: string) {
  const [row] = await tx
    .select({ groupId: groupMember.groupId, voice: groupMember.voice, startDate: groupMember.startDate })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(
      and(
        eq(groupMember.userId, userId),
        isNull(groupMember.endDate),
        eq(group.choirId, choirId),
        eq(group.type, "Section")
      )
    )
  return row
}

/** The active Section of the Choir whose Voice contains `voice`: the Voice itself, or its family. */
async function sectionSinging(tx: OrgStructureTransaction, choirId: string, voice: Voice) {
  const [row] = await tx
    .select({ sectionId: section.groupId })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .where(
      and(
        eq(group.choirId, choirId),
        eq(group.type, "Section"),
        eq(group.active, true),
        inArray(section.voice, [...new Set([voice, familyOf(voice)])])
      )
    )
  if (!row) throw new RuleViolation("voice-not-sung-in-choir")
  return row.sectionId
}
