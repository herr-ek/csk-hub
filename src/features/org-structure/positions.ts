import "server-only"

import { and, eq, gt, gte, inArray, isNull, or } from "drizzle-orm"
import { groupTypePosition, position, positionHolder } from "@/core/db/schema/org-structure"
import { findCurrentMembership, requireActiveGroup } from "./lookup"
import type { IsoDate } from "./model"
import {
  lockUser,
  type OrgStructureDatabase,
  type OrgStructureTransaction,
  RuleViolation,
  requireDate,
  runOrgStructureCommand
} from "./operation"

type HoldingInput = { userId: string; groupId: string; positionId: string }

/** Starts a Position holding for a current member of a group whose type allows the Position. */
export function startPositionHolding(database: OrgStructureDatabase, input: HoldingInput & { startDate: IsoDate }) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    await lockUser(tx, input.userId)
    await addHolding(tx, input, startDate)
  })
}

export function endPositionHolding(database: OrgStructureDatabase, input: HoldingInput & { endDate: IsoDate }) {
  return runOrgStructureCommand(database, async (tx) => {
    const endDate = requireDate(input.endDate)
    await lockUser(tx, input.userId)
    await closeHolding(tx, input, endDate)
  })
}

/**
 * Gives a Position in a group to a current member. Any current holder's holding ends on the new
 * holder's start date, so the handover leaves no gap and no overlap.
 */
export function replacePositionHolder(database: OrgStructureDatabase, input: HoldingInput & { startDate: IsoDate }) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    const [current] = await tx
      .select({ userId: positionHolder.userId })
      .from(positionHolder)
      .where(
        and(
          eq(positionHolder.groupId, input.groupId),
          eq(positionHolder.positionId, input.positionId),
          isNull(positionHolder.endDate)
        )
      )
      .for("update")
    if (current?.userId === input.userId) throw new RuleViolation("already-holding-position")

    // Both users' locks, in a fixed order, so two handovers between the same people cannot deadlock.
    for (const userId of [input.userId, current?.userId].filter(Boolean).sort()) await lockUser(tx, userId as string)
    if (current) await closeHolding(tx, { ...input, userId: current.userId }, startDate)
    await addHolding(tx, input, startDate)
  })
}

/** Starts a holding for a user already locked by the caller. */
export async function addHolding(tx: OrgStructureTransaction, input: HoldingInput, startDate: IsoDate) {
  const row = await requireActiveGroup(tx, input.groupId)
  const [found] = await tx.select({ id: position.id }).from(position).where(eq(position.id, input.positionId))
  if (!found) throw new RuleViolation("position-not-found")

  const [allowed] = await tx
    .select({ positionId: groupTypePosition.positionId })
    .from(groupTypePosition)
    .where(and(eq(groupTypePosition.positionId, input.positionId), eq(groupTypePosition.type, row.type)))
  if (!allowed) throw new RuleViolation("position-not-allowed")

  const membership = await findCurrentMembership(tx, input.userId, input.groupId)
  if (!membership) throw new RuleViolation("not-a-member")
  if (membership.startDate > startDate) throw new RuleViolation("period-conflict")

  const [holder] = await tx
    .select({ userId: positionHolder.userId })
    .from(positionHolder)
    .where(
      and(
        eq(positionHolder.groupId, input.groupId),
        eq(positionHolder.positionId, input.positionId),
        isNull(positionHolder.endDate)
      )
    )
  if (holder) throw new RuleViolation("position-taken")

  const [overlap] = await tx
    .select({ startDate: positionHolder.startDate })
    .from(positionHolder)
    .where(
      and(
        eq(positionHolder.userId, input.userId),
        eq(positionHolder.groupId, input.groupId),
        eq(positionHolder.positionId, input.positionId),
        or(gte(positionHolder.startDate, startDate), gt(positionHolder.endDate, startDate))
      )
    )
    .limit(1)
  if (overlap) throw new RuleViolation("period-conflict")

  await tx.insert(positionHolder).values({ ...input, startDate })
}

export async function closeHolding(tx: OrgStructureTransaction, input: HoldingInput, endDate: IsoDate) {
  const ended = await tx
    .update(positionHolder)
    .set({ endDate })
    .where(
      and(
        eq(positionHolder.userId, input.userId),
        eq(positionHolder.groupId, input.groupId),
        eq(positionHolder.positionId, input.positionId),
        isNull(positionHolder.endDate)
      )
    )
    .returning({ userId: positionHolder.userId })
  if (ended.length === 0) throw new RuleViolation("not-holding-position")
}

/** Ends every current Position the user holds in the given groups, as their Membership ends. */
export async function endHoldingsInGroups(
  tx: OrgStructureTransaction,
  userId: string,
  groupIds: string[],
  endDate: IsoDate
) {
  await tx
    .update(positionHolder)
    .set({ endDate })
    .where(
      and(eq(positionHolder.userId, userId), inArray(positionHolder.groupId, groupIds), isNull(positionHolder.endDate))
    )
}
