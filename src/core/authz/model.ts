import type { user } from "@/core/db/schema/auth"
import type { event } from "@/core/db/schema/events"
import type { group, groupMember, positionHolder } from "@/core/db/schema/org-structure"
import type { post } from "@/core/db/schema/posts"
import type { AudienceMembership, AudienceTarget } from "./event-audience"

/** Minimal resource facts, loaded on the server by the feature performing the operation. */
export type PostAttributes = Readonly<Pick<typeof post.$inferSelect, "id" | "authorId" | "publishedAt" | "discardedAt">>
export type GroupAttributes = Readonly<Pick<typeof group.$inferSelect, "id" | "type" | "active">>
export type MemberAttributes = Readonly<Pick<typeof user.$inferSelect, "id" | "banned">>

/** Period facts retain today's endDate === null semantics, including future start dates. */
export type MembershipAttributes = Readonly<
  Pick<typeof groupMember.$inferSelect, "userId" | "groupId" | "startDate" | "endDate">
>
export type PositionHoldingAttributes = Readonly<
  Pick<typeof positionHolder.$inferSelect, "userId" | "groupId" | "positionId" | "startDate" | "endDate">
>

type PostContext = Readonly<{ post: PostAttributes | null }>
type GroupContext = Readonly<{ group: GroupAttributes | null }>
type GroupWorkContext = GroupContext &
  Readonly<{
    memberships: readonly MembershipAttributes[]
    positionHoldings: readonly PositionHoldingAttributes[]
  }>
export type EventAttributes = Readonly<Pick<typeof event.$inferSelect, "id" | "organiserGroupId">>
type EventContext = GroupWorkContext & Readonly<{ event: EventAttributes | null }>

export type EventViewAttributes = EventAttributes &
  Readonly<Pick<typeof event.$inferSelect, "type" | "status" | "startsAt">>
type EventViewContext = Omit<EventContext, "event"> &
  Readonly<{
    event: EventViewAttributes | null
    targets: readonly AudienceTarget[]
    audienceMemberships: readonly AudienceMembership[]
    now: Date
  }>
type EventPrivateContext = EventContext & Readonly<{ record: { eventId: string; userId: string | null } | null }>
type EventAttendanceContext = Omit<EventViewContext, "audienceMemberships"> &
  Readonly<{
    record: { eventId: string; userId: string | null } | null
    subjectMemberships: readonly AudienceMembership[]
    sections: readonly GroupAttributes[]
    sectionHoldings: readonly (PositionHoldingAttributes & { positionCode: string | null })[]
  }>

type MemberContext = Readonly<{ member: MemberAttributes | null }>

/**
 * The facts required for each action. Supply attributes, never precomputed permission booleans.
 * Null resources represent missing records and deny access. These contracts cover today's schema;
 * Group-authored Posts and audience changes still need their own contexts and policies.
 */
export type PermissionContext = {
  "memberId.issue": undefined
  "memberId.verify": undefined
  "app.access": undefined
  "post.create": undefined
  "post.read": PostContext
  "post.update": PostContext
  "post.publish": PostContext
  "post.unpublish": PostContext
  "post.discard": PostContext
  "group.publishPost": GroupWorkContext
  "group.manageContent": GroupWorkContext
  "group.manageEvents": GroupWorkContext
  "group.manageMemberships": GroupContext
  "group.managePositions": GroupContext
  "member.read": MemberContext
  "member.readEmail": MemberContext
  "member.editProfile": MemberContext
  "admin.access": undefined
  "event.create": GroupWorkContext
  "event.read": EventContext
  "event.view": EventViewContext
  "event.readResponseReason": EventPrivateContext
  "event.readRegistrationAnswers": EventPrivateContext
  "event.readAttendance": EventAttendanceContext
  "event.recordAttendance": EventAttendanceContext
  "event.update": EventContext & Readonly<{ proposedOrganiser: GroupWorkContext }>
  "event.changeStatus": EventContext
  "event.delete": EventContext
  "event.administer": undefined
  "org.manage": undefined
  "user.administer": undefined
  "notification.broadcast": undefined
}

export type PermissionAction = keyof PermissionContext

/** A discriminated union keeps the action and its context correlated, even for union callers. */
export type PermissionRequest<Action extends PermissionAction = PermissionAction> = {
  [Key in PermissionAction]: Readonly<
    { action: Key } & (PermissionContext[Key] extends undefined
      ? { context?: never }
      : { context: PermissionContext[Key] })
  >
}[Action]

/** Authenticated active User identity, resolved from the current session and database. */
export type AuthorizationActor = Readonly<{
  userId: string
  isAdmin: boolean
}>

/** Only a trusted server session resolver may produce this, never a submitted form or client. */
export type AuthorizationSession = {
  user: { id: string }
}

/** Each policy receives exactly the context declared for its action. */
export type AuthorizationPolicy<Action extends PermissionAction> = (
  actor: AuthorizationActor,
  context: PermissionContext[Action]
) => boolean

/** An action cannot be added without supplying a policy. */
export type AuthorizationPolicies = {
  readonly [Action in PermissionAction]: AuthorizationPolicy<Action>
}
