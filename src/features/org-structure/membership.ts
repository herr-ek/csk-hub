import "server-only"

import { and, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm"
import { directMembership, group, section } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, GroupType, type IsoDate } from "@/core/org-structure"
import { contains, familyOf, type VoiceDivision } from "@/features/voice/model"
import {
  addDirectMembership,
  changeDirectMembership,
  endUncoveredAppointments,
  validateUserParticipation
} from "./direct-membership"
import { cskToday } from "./effective-reads"
import type { OrgStructureDatabase, OrgStructureTransaction } from "./operation"
import { lockUser, RuleViolation, requireDate, runOrgStructureCommand } from "./operation"

type StartMembershipInput = { userId: string; groupId: string; startDate: IsoDate; voice?: VoiceDivision }

/** Adds direct participation where allowed; gig groups require their own Voice division. */
export function startMembership(database: OrgStructureDatabase, input: StartMembershipInput) {
  return runOrgStructureCommand(database, async (tx) => {
    await lockUser(tx, input.userId)
    const [target] = await tx.select().from(group).where(eq(group.id, input.groupId)).for("share")
    if (!target) throw new RuleViolation("group-not-found")
    if (target.type === GroupType.Section) throw new RuleViolation("section-requires-placement")
    if (GROUP_POLICIES[target.type].directMembership === "no") throw new RuleViolation("direct-membership-forbidden")
    expectSuccess(await addDirectMembership(tx, input))
  })
}

type PlaceSingerInput = { userId: string; choirId: string; voice: VoiceDivision; startDate: IsoDate }

/** Places a singer in the active Choir Section that contains their Voice. */
export function placeSinger(database: OrgStructureDatabase, input: PlaceSingerInput) {
  return runOrgStructureCommand(database, async (tx) => {
    requireDate(input.startDate)
    await lockUser(tx, input.userId)
    const sectionId = await sectionForVoice(tx, input.choirId, input.voice)
    expectSuccess(
      await addDirectMembership(tx, {
        userId: input.userId,
        groupId: sectionId,
        voice: input.voice,
        startDate: input.startDate
      })
    )
    return { sectionId }
  })
}

type PlaceSingerInSectionInput = { userId: string; sectionId: string; voice: VoiceDivision; startDate: IsoDate }

/** Places a singer in a selected Section, refusing Voices the Section does not sing. */
export function placeSingerInSection(database: OrgStructureDatabase, input: PlaceSingerInSectionInput) {
  return runOrgStructureCommand(database, async (tx) => {
    requireDate(input.startDate)
    await lockUser(tx, input.userId)
    const [target] = await tx
      .select({ type: group.type, choirId: group.choirId, active: group.active })
      .from(group)
      .where(eq(group.id, input.sectionId))
      .for("share")
    const [sung] = await tx.select({ voice: section.voice }).from(section).where(eq(section.groupId, input.sectionId))
    if (target?.type !== GroupType.Section || !target.choirId) throw new RuleViolation("group-not-found")
    if (!target.active) throw new RuleViolation("group-archived")
    if (!sung || !contains(sung.voice, input.voice)) throw new RuleViolation("voice-not-sung-in-section")
    expectSuccess(
      await addDirectMembership(tx, {
        userId: input.userId,
        groupId: input.sectionId,
        voice: input.voice,
        startDate: input.startDate
      })
    )
    return { sectionId: input.sectionId }
  })
}

type ChangeVoiceInput = {
  userId: string
  choirId: string
  voice: VoiceDivision
  date: IsoDate
  endAppointments?: boolean
}

/** Changes Voice from the requested date while preserving Choir membership. A Voice in another Section
 * ends that Section's Stämförälder appointment with `endAppointments`, and is refused without it.
 */
export function changeVoice(database: OrgStructureDatabase, input: ChangeVoiceInput, today: IsoDate = cskToday()) {
  return runOrgStructureCommand(database, async (tx) => {
    const date = requireDate(input.date)
    await lockUser(tx, input.userId)
    const [current] = await tx
      .select({
        id: directMembership.id,
        groupId: directMembership.groupId,
        voice: directMembership.voice,
        startDate: directMembership.startDate,
        endDate: directMembership.endDate
      })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .where(
        and(
          eq(directMembership.userId, input.userId),
          eq(group.choirId, input.choirId),
          eq(group.type, GroupType.Section),
          lte(directMembership.startDate, date),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, date))
        )
      )
      .for("update", { of: directMembership })
    if (!current) throw new RuleViolation("not-a-singer")
    if (current.voice === input.voice) throw new RuleViolation("same-voice")
    const sectionId = await sectionForVoice(tx, input.choirId, input.voice)
    expectSuccess(
      await changeDirectMembership(
        tx,
        {
          membershipId: current.id,
          date,
          groupId: sectionId,
          endDate: current.endDate,
          voice: input.voice,
          endAppointments: input.endAppointments
        },
        today
      )
    )
    return { sectionId }
  })
}

type EndMembershipInput = {
  userId: string
  groupId: string
  endDate: IsoDate
  membershipId?: string
  endAppointments?: boolean
}

/** Ends direct membership; leaving a Choir atomically ends its Section and Choir-team periods too.
 * With `endAppointments`, the Choir's later planned periods are dropped and appointments that lose
 * their prerequisite end as well; without it they refuse the departure.
 */
export function endMembership(database: OrgStructureDatabase, input: EndMembershipInput, today: IsoDate = cskToday()) {
  return runOrgStructureCommand(database, async (tx) => {
    const endDate = requireDate(input.endDate)
    await lockUser(tx, input.userId)
    const [target] = await tx.select().from(group).where(eq(group.id, input.groupId)).for("share")
    if (!target) throw new RuleViolation("group-not-found")
    let selectedAlreadyEnded = false
    if (input.membershipId) {
      const [selected] = await tx
        .select({
          id: directMembership.id,
          userId: directMembership.userId,
          groupId: directMembership.groupId,
          startDate: directMembership.startDate,
          endDate: directMembership.endDate
        })
        .from(directMembership)
        .where(eq(directMembership.id, input.membershipId))
        .for("update")
      if (!selected || selected.userId !== input.userId || selected.groupId !== input.groupId)
        throw new RuleViolation("not-a-member")
      selectedAlreadyEnded = endDate === selected.endDate
      if (endDate <= selected.startDate || (selected.endDate !== null && endDate > selected.endDate))
        throw new RuleViolation("period-conflict")
    }
    const currentPeriods = await tx
      .select({ id: directMembership.id, startDate: directMembership.startDate, endDate: directMembership.endDate })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .where(
        and(
          eq(directMembership.userId, input.userId),
          target.type === GroupType.Choir
            ? or(eq(group.id, input.groupId), eq(group.choirId, input.groupId))
            : eq(group.id, input.groupId),
          lte(directMembership.startDate, endDate),
          or(isNull(directMembership.endDate), gt(directMembership.endDate, endDate))
        )
      )
      .for("update", { of: directMembership })
    if (!currentPeriods.length && selectedAlreadyEnded) return
    if (!currentPeriods.length) throw new RuleViolation("not-a-member")
    for (const row of currentPeriods) {
      if (endDate <= row.startDate || (row.endDate !== null && endDate > row.endDate))
        throw new RuleViolation("period-conflict")
      await tx.update(directMembership).set({ endDate }).where(eq(directMembership.id, row.id))
    }
    if (input.endAppointments) {
      await dropPlannedPeriods(tx, input, endDate, today)
      await endUncoveredAppointments(tx, input.userId, endDate, today)
    }
    await validateUserParticipation(tx, input.userId)
  })
}

/** Deletes the periods in a Group, and in a Choir's own Groups, that would begin after a departure. */
async function dropPlannedPeriods(
  tx: OrgStructureTransaction,
  input: { userId: string; groupId: string },
  endDate: IsoDate,
  today: IsoDate
) {
  if (endDate < today) return
  const planned = await tx
    .select({ id: directMembership.id })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .where(
      and(
        eq(directMembership.userId, input.userId),
        or(eq(group.id, input.groupId), eq(group.choirId, input.groupId)),
        gte(directMembership.startDate, endDate)
      )
    )
  if (planned.length === 0) return
  await tx.delete(directMembership).where(
    inArray(
      directMembership.id,
      planned.map(({ id }) => id)
    )
  )
}

async function sectionForVoice(tx: OrgStructureTransaction, choirId: string, voice: VoiceDivision) {
  const [row] = await tx
    .select({ sectionId: section.groupId })
    .from(section)
    .innerJoin(group, eq(group.id, section.groupId))
    .where(
      and(
        eq(group.choirId, choirId),
        eq(group.type, GroupType.Section),
        eq(group.active, true),
        inArray(section.voice, [voice, familyOf(voice)])
      )
    )
  if (!row) throw new RuleViolation("voice-not-sung-in-choir")
  return row.sectionId
}

function expectSuccess<T>(
  result: { success: true; data: T } | { success: false; error: import("@/core/org-structure").OrgStructureViolation }
) {
  if (!result.success) throw new RuleViolation(result.error)
  return result.data
}
