import { eventMembershipDate, inAudience } from "./event-audience"
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

function canReadPrivateParticipation(
  actor: AuthorizationActor,
  context: PermissionContext["event.readResponseReason"]
): boolean {
  return (
    context.event !== null &&
    context.record !== null &&
    context.record.eventId === context.event.id &&
    (context.record.userId === actor.userId || canManageEvent(actor, context))
  )
}

function isCurrentSectionParent(
  actor: AuthorizationActor,
  context: PermissionContext["event.readAttendance"]
): boolean {
  if (
    !context.event ||
    !context.record?.userId ||
    (context.event.type !== "Rehearsal" && context.event.type !== "Concert")
  )
    return false
  const startsAt = context.event.startsAt
  // Date-only Memberships use the existing inclusive Stockholm start-date rule.
  return context.sections.some(
    (section) =>
      section.type === "Section" &&
      section.active &&
      context.sectionHoldings.some(
        (holding) =>
          holding.positionCode === "stamforalder" &&
          holding.userId === actor.userId &&
          holding.groupId === section.id &&
          holding.startDate <= eventMembershipDate(context.now) &&
          holding.endDate === null
      ) &&
      context.subjectMemberships.some(
        (membership) =>
          membership.groupType === "Section" &&
          membership.groupId === section.id &&
          inAudience([membership], {
            startsAt,
            targets: [{ groupId: section.id, groupType: "Section", voiceFamily: null }]
          })
      )
  )
}

function canReadAttendance(actor: AuthorizationActor, context: PermissionContext["event.readAttendance"]): boolean {
  return (
    canReadPrivateParticipation(actor, context) ||
    (context.event !== null && context.record?.eventId === context.event.id && isCurrentSectionParent(actor, context))
  )
}

function canRecordAttendance(actor: AuthorizationActor, context: PermissionContext["event.recordAttendance"]): boolean {
  return (
    context.event?.status === "Published" &&
    context.record !== null &&
    context.record.eventId === context.event.id &&
    context.record.userId !== null &&
    inAudience(
      context.subjectMemberships,
      { startsAt: context.event.startsAt, targets: context.targets },
      context.now
    ) &&
    (canManageEvent(actor, context) || isCurrentSectionParent(actor, context))
  )
}

/** Organiser authority is independent of creator, audience, Event type and lifecycle state. */
export const eventPolicies = {
  "event.create": canCreateEvent,
  "event.read": canManageEvent,
  "event.view": canViewEvent,
  "event.readResponseReason": canReadPrivateParticipation,
  "event.readRegistrationAnswers": canReadPrivateParticipation,
  "event.readAttendance": canReadAttendance,
  "event.recordAttendance": canRecordAttendance,
  "event.update": canUpdateEvent,
  "event.changeStatus": canManageEvent,
  "event.delete": canManageEvent
} satisfies Pick<AuthorizationPolicies, Exclude<`event.${string}` & keyof AuthorizationPolicies, "event.administer">>
