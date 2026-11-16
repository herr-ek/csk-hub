import { inAudience } from "./event-audience"
import { groupPolicies } from "./group-policies"
import type { AuthorizationActor, AuthorizationPolicies, PermissionContext } from "./model"

function canCreateEvent(actor: AuthorizationActor, context: PermissionContext["event.create"]): boolean {
  return actor.isAdmin || groupPolicies["group.manageEvents"](actor, context)
}

function canManageEvent(actor: AuthorizationActor, context: PermissionContext["event.read"]): boolean {
  if (!context.event) return false
  if (actor.isAdmin) return true
  return (
    context.event.organiserGroupId !== null &&
    context.event.organiserGroupId === context.group?.id &&
    groupPolicies["group.manageEvents"](actor, context)
  )
}

function canUpdateEvent(actor: AuthorizationActor, context: PermissionContext["event.update"]): boolean {
  return canManageEvent(actor, context) && canCreateEvent(actor, context.proposedOrganiser)
}

function canViewEvent(actor: AuthorizationActor, context: PermissionContext["event.view"]): boolean {
  return (
    context.event !== null &&
    (canManageEvent(actor, context) ||
      (context.event.status !== "Draft" &&
        inAudience(
          context.audienceMemberships,
          {
            startsAt: context.event.startsAt,
            targets: context.targets
          },
          context.now
        )))
  )
}

/** Organiser authority is independent of creator, audience, Event type and lifecycle state. */
export const eventPolicies = {
  "event.create": canCreateEvent,
  "event.read": canManageEvent,
  "event.view": canViewEvent,
  "event.update": canUpdateEvent,
  "event.changeStatus": canManageEvent,
  "event.delete": canManageEvent
} satisfies Pick<AuthorizationPolicies, Exclude<`event.${string}` & keyof AuthorizationPolicies, "event.administer">>
