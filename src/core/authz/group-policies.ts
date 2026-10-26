import type { AuthorizationActor, AuthorizationPolicies, PermissionContext } from "./model"

function canRepresentGroup(
  actor: AuthorizationActor,
  {
    group,
    memberships,
    positionHoldings
  }: PermissionContext["group.publishPost" | "group.manageContent" | "group.manageEvents"]
): boolean {
  if (!group?.active) return false
  if (actor.isAdmin) return true
  if (group.type === "Choir") return false

  // Match both the actor and the exact Group; no authority follows Choir ownership or links.
  const isMember = memberships.some(
    (membership) => membership.userId === actor.userId && membership.groupId === group.id && membership.endDate === null
  )
  const holdsPosition = positionHoldings.some(
    (holding) => holding.userId === actor.userId && holding.groupId === group.id && holding.endDate === null
  )
  return isMember && holdsPosition
}

function canAdministerGroup(
  actor: AuthorizationActor,
  { group }: PermissionContext["group.manageMemberships" | "group.managePositions"]
): boolean {
  return group?.active === true && actor.isAdmin
}

/** Group authority is not permission to act on arbitrary Post or Event instances. */
export const groupPolicies = {
  "group.publishPost": canRepresentGroup,
  "group.manageContent": canRepresentGroup,
  "group.manageEvents": canRepresentGroup,
  "group.manageMemberships": canAdministerGroup,
  "group.managePositions": canAdministerGroup
} satisfies Pick<AuthorizationPolicies, `group.${string}` & keyof AuthorizationPolicies>
