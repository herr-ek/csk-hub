import { cskToday, GroupType } from "@/core/org-structure"
import type { AuthorizationActor, AuthorizationPolicies, PermissionContext } from "./model"

function canRepresentGroup(
  actor: AuthorizationActor,
  {
    group,
    memberships,
    positionAppointments
  }: PermissionContext["group.publishPost" | "group.manageContent" | "group.manageEvents"]
): boolean {
  if (!group?.active) return false
  if (actor.isAdmin) return true
  if (group.type === GroupType.Choir) return false

  // Match both the actor and the exact Group; no authority follows Choir ownership or links.
  const today = cskToday()
  const isCurrent = (period: { startDate: string; endDate: string | null }) =>
    period.startDate <= today && (period.endDate === null || period.endDate > today)
  const isMember = memberships.some(
    (membership) => membership.userId === actor.userId && membership.groupId === group.id && isCurrent(membership)
  )
  const holdsPosition = positionAppointments.some(
    (holding) => holding.userId === actor.userId && holding.contextGroupId === group.id && isCurrent(holding)
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
