import type { AuthorizationActor, AuthorizationPolicies } from "./model"

function canIssue(actor: AuthorizationActor): boolean {
  return actor.impersonatedBy === null
}

function canVerify(actor: AuthorizationActor): boolean {
  return actor.isAdmin && actor.impersonatedBy === null
}

/** A support impersonation session cannot present or verify a member ID. */
export const memberIdPolicies = {
  "memberId.issue": canIssue,
  "memberId.verify": canVerify
} satisfies Pick<AuthorizationPolicies, "memberId.issue" | "memberId.verify">
