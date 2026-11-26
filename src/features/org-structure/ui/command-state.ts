import { ROUTES } from "@/core/navigation/site"
import type { OrgStructureViolation } from "@/core/org-structure"
import type { CommandState } from "@/shared/forms/command-state"

/** Why an admin groups command failed: a rule the module enforces, bad form input, or anything else. */
export type GroupCommandError = OrgStructureViolation | "invalid-input" | "unexpected"

export type GroupCommandState = CommandState<GroupCommandError>

/** A Group's past participation and its corrections. */
export function groupHistoryPath(groupId: string) {
  return `${ROUTES.adminGroupHistory}/${groupId}`
}

/** A committee's roster, in a year when it has one; `key` is its Group type, or an Other Group's id. */
export function committeePath(key: string, year?: number) {
  const path = `${ROUTES.adminCommittees}?committee=${encodeURIComponent(key)}`
  return year === undefined ? path : `${path}&year=${year}`
}

export function gigGroupPath(groupId: string) {
  return `${ROUTES.adminGigGroups}/${groupId}`
}
