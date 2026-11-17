import type { AuthorizationActor, AuthorizationPolicies } from "./model"

function canIssue(actor: AuthorizationActor): boolean {
  return Boolean(actor.userId)
}

function canVerify(actor: AuthorizationActor): boolean {
  return actor.isAdmin
}

/** Active members present their own ID; verification requires explicit Admin authority. */
export const memberIdPolicies = {
  "memberId.issue": canIssue,
  "memberId.verify": canVerify
} satisfies Pick<AuthorizationPolicies, "memberId.issue" | "memberId.verify">
