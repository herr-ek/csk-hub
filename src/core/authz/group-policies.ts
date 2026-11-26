import { cskToday, GroupType } from "@/core/org-structure"
import type {
  AuthorizationActor,
  AuthorizationPolicies,
  PermissionContext,
  PositionAppointmentAttributes
} from "./model"

/** Whether the actor holds a Position today in exactly this Group; no authority follows Choir ownership or links. */
export function holdsCurrentPosition(
  actor: AuthorizationActor,
  positionAppointments: readonly PositionAppointmentAttributes[],
  groupId: string,
  today = cskToday()
): boolean {
  return positionAppointments.some(
    (holding) =>
      holding.userId === actor.userId &&
      holding.contextGroupId === groupId &&
      holding.startDate <= today &&
      (holding.endDate === null || holding.endDate > today)
  )
}

function canRepresentGroup(
  actor: AuthorizationActor,
  { group, positionAppointments, today }: PermissionContext["group.publishPost"]
): boolean {
  if (!group?.active) return false
  if (actor.isAdmin) return true
  if (group.type === GroupType.Choir) return false
  return holdsCurrentPosition(actor, positionAppointments, group.id, today)
}

function canAdministerGroup(
  actor: AuthorizationActor,
  { group }: PermissionContext["group.manageMemberships" | "group.managePositions"]
): boolean {
  return group?.active === true && actor.isAdmin
}

/** Group authority is not permission to act on arbitrary Post or Event instances. */
export const groupPolicies = {
  "group.publishPost": (actor, context) => context.group?.type !== GroupType.Choir && canRepresentGroup(actor, context),
  "group.manageContent": canRepresentGroup,
  "group.manageEvents": canRepresentGroup,
  "group.manageMemberships": canAdministerGroup,
  "group.managePositions": canAdministerGroup
} satisfies Pick<AuthorizationPolicies, `group.${string}` & keyof AuthorizationPolicies>
