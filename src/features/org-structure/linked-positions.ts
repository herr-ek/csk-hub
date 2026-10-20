import "server-only"

import { findCurrentMembership } from "./lookup"
import { addMembership } from "./membership"
import type { IsoDate } from "./model"
import {
  lockPositionCatalogue,
  lockPositionSlot,
  lockUser,
  type OrgStructureDatabase,
  RuleViolation,
  requireDate,
  runOrgStructureCommand
} from "./operation"
import { addHolding, closeHolding } from "./positions"

/**
 * One Position held across several Groups as a linked assignment, such as the Board's Sexmästare
 * who also leads the Sexmästeri: one holding per Group, plus Membership in each.
 */
type LinkedPositionInput = { userId: string; positionId: string; groupIds: string[] }

/** Starts the holding in every group, and any missing Membership, or nothing at all. */
export function startLinkedPosition(
  database: OrgStructureDatabase,
  input: LinkedPositionInput & { startDate: IsoDate }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    if (input.groupIds.length === 0) throw new RuleViolation("group-not-found")
    const groupIds = [...new Set(input.groupIds)].sort()
    await lockPositionCatalogue(tx, input.positionId)
    for (const groupId of groupIds) await lockPositionSlot(tx, groupId, input.positionId)
    await lockUser(tx, input.userId)

    for (const groupId of groupIds) {
      if (!(await findCurrentMembership(tx, input.userId, groupId))) {
        await addMembership(tx, input.userId, groupId, startDate)
      }
      await addHolding(tx, { userId: input.userId, groupId, positionId: input.positionId }, startDate)
    }
  })
}

/** Ends the holding in every group together. Memberships are left as they are. */
export function endLinkedPosition(database: OrgStructureDatabase, input: LinkedPositionInput & { endDate: IsoDate }) {
  return runOrgStructureCommand(database, async (tx) => {
    const endDate = requireDate(input.endDate)
    if (input.groupIds.length === 0) throw new RuleViolation("group-not-found")
    const groupIds = [...new Set(input.groupIds)].sort()
    await lockPositionCatalogue(tx, input.positionId)
    for (const groupId of groupIds) await lockPositionSlot(tx, groupId, input.positionId)
    await lockUser(tx, input.userId)

    for (const groupId of groupIds) {
      await closeHolding(tx, { userId: input.userId, groupId, positionId: input.positionId }, endDate)
    }
  })
}
