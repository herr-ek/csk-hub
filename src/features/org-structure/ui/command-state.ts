import { ROUTES } from "@/core/navigation/site"
import type { CommandState } from "@/shared/forms/command-state"
import type { OrgStructureViolation } from "../model"

/** Why an admin groups command failed: a rule the module enforces, bad form input, or anything else. */
export type GroupCommandError = OrgStructureViolation | "invalid-input" | "unexpected"

export type GroupCommandState = CommandState<GroupCommandError>

/** The detail page of one group. */
export function groupDetailPath(groupId: string) {
  return `${ROUTES.adminOrgStructure}/${groupId}`
}
