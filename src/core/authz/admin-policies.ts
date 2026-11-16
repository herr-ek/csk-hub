import type { AuthorizationActor, AuthorizationPolicies } from "./model"

function canAdminister(actor: AuthorizationActor): boolean {
  return actor.isAdmin
}

/** Explicit administrative grants; account-specific safeguards still apply in their workflows. */
export const adminPolicies = {
  "admin.access": canAdminister,
  "event.administer": canAdminister,
  "org.manage": canAdminister,
  "user.administer": canAdminister,
  "notification.broadcast": canAdminister
} satisfies Pick<
  AuthorizationPolicies,
  "admin.access" | "event.administer" | "org.manage" | "user.administer" | "notification.broadcast"
>
