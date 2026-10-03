import { ROUTES } from "@/core/navigation/site"
import type { OrgStructureViolation } from "../model"

/** Why an admin groups command failed: a rule the module enforces, bad form input, or anything else. */
export type GroupCommandError = OrgStructureViolation | "invalid-input" | "unexpected"

export type GroupCommandState =
  | { status: "idle" }
  // `completedAt` makes two successive successes distinct, so the form reacts to each one.
  | { status: "success"; completedAt: number }
  | { status: "error"; error: GroupCommandError }

export const IDLE: GroupCommandState = { status: "idle" }

/** The detail page of one group. */
export function groupDetailPath(groupId: string) {
  return `${ROUTES.adminGroups}/${groupId}`
}
