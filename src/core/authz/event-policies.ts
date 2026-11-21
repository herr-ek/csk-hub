import { GroupType } from "@/core/org-structure"
import type { AudienceTarget } from "./event-audience"
import { inAudience } from "./event-audience"
import { groupPolicies, holdsCurrentPosition } from "./group-policies"
import type { AuthorizationActor, AuthorizationPolicies, EventAttributes, PermissionContext } from "./model"

function canCreateEvent(actor: AuthorizationActor, context: PermissionContext["event.create"]): boolean {
  return actor.isAdmin || groupPolicies["group.manageEvents"](actor, context)
}

/** Admin, or a current Position holder in an active Board group. */
function canScheduleRehearsals(
  actor: AuthorizationActor,
  { groups, positionAppointments }: PermissionContext["event.scheduleRehearsals"]
): boolean {
  if (actor.isAdmin) return true
  return groups.some(
    (group) =>
      group.type === GroupType.Board && group.active && holdsCurrentPosition(actor, positionAppointments, group.id)
  )
}

/** A Rehearsal in a Series whose only Target is one whole Choir: what the Board schedules. */
function isChoirSeriesRehearsal(
  event: Pick<EventAttributes, "type" | "seriesId">,
  targets: readonly AudienceTarget[]
): boolean {
  const [only, ...others] = targets
  return (
    event.type === "Rehearsal" &&
    event.seriesId !== null &&
    others.length === 0 &&
    only?.groupType === GroupType.Choir &&
    only.voiceFamily === null
  )
}

function canManageEvent(actor: AuthorizationActor, context: PermissionContext["event.read"]): boolean {
  if (!context.event) return false
  if (actor.isAdmin) return true
  if (isChoirSeriesRehearsal(context.event, context.targets) && canScheduleRehearsals(actor, context)) return true
  return (
    context.event.organiserGroupId !== null &&
    context.event.organiserGroupId === context.group?.id &&
    groupPolicies["group.manageEvents"](actor, context)
  )
}

/** The Board may change a Choir's Series Rehearsal only into one, under the same organiser. */
function canUpdateEvent(actor: AuthorizationActor, context: PermissionContext["event.update"]): boolean {
  if (!canManageEvent(actor, context) || !context.event) return false
  if (canCreateEvent(actor, context.proposedOrganiser)) return true
  return (
    (context.proposedOrganiser.group?.id ?? null) === context.event.organiserGroupId &&
    isChoirSeriesRehearsal(
      { type: context.proposedEvent.type, seriesId: context.event.seriesId },
      context.proposedEvent.targets
    ) &&
    canScheduleRehearsals(actor, context)
  )
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

/**
 * Organiser authority is independent of creator, audience and lifecycle state. The one exception
 * is the Board's, over Choirs' Series Rehearsals, which follows the Event's type, Series and Targets.
 */
export const eventPolicies = {
  "event.create": canCreateEvent,
  "event.read": canManageEvent,
  "event.view": canViewEvent,
  "event.update": canUpdateEvent,
  "event.changeStatus": canManageEvent,
  "event.delete": canManageEvent,
  "event.scheduleRehearsals": canScheduleRehearsals
} satisfies Pick<AuthorizationPolicies, Exclude<`event.${string}` & keyof AuthorizationPolicies, "event.administer">>
