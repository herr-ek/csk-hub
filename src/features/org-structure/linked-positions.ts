import "server-only"

import { findCurrentMembership } from "./lookup"
import { addMembership } from "./membership"
import type { IsoDate } from "./model"
import { lockUser, type OrgStructureDatabase, RuleViolation, requireDate, runOrgStructureCommand } from "./operation"
import { addHolding, closeHolding } from "./positions"

/**
 * One Position held across several groups as a single office, such as the Board's Sexmästare
 * who also leads the Sexmästeri: one holding per group, plus Membership in each.
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
    await lockUser(tx, input.userId)

    for (const groupId of new Set(input.groupIds)) {
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
    await lockUser(tx, input.userId)

    for (const groupId of new Set(input.groupIds)) {
      await closeHolding(tx, { userId: input.userId, groupId, positionId: input.positionId }, endDate)
    }
  })
}
