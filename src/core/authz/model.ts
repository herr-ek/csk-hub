import type { user } from "@/core/db/schema/auth"
import type { event } from "@/core/db/schema/events"
import type { group, groupMember, positionHolder } from "@/core/db/schema/org-structure"
import type { post, postTarget } from "@/core/db/schema/posts"
import type { AudienceMembership, AudienceTarget } from "./event-audience"

/** Minimal resource facts, loaded on the server by the feature performing the operation. */
export type PostAttributes = Readonly<
  Pick<
    typeof post.$inferSelect,
    "id" | "authorId" | "publishedAt" | "discardedAt" | "publisherGroupId" | "firstPublishedAt" | "audienceAll"
  >
>
export type GroupAttributes = Readonly<Pick<typeof group.$inferSelect, "id" | "type" | "active">>
export type MemberAttributes = Readonly<Pick<typeof user.$inferSelect, "id" | "banned">>

/** Period facts retain today's endDate === null semantics, including future start dates. */
export type MembershipAttributes = Readonly<
  Pick<typeof groupMember.$inferSelect, "userId" | "groupId" | "startDate" | "endDate">
>
export type PositionHoldingAttributes = Readonly<
  Pick<typeof positionHolder.$inferSelect, "userId" | "groupId" | "positionId" | "startDate" | "endDate">
>

export type PostGroupAttributes = GroupAttributes & Readonly<{ choirId: string | null }>
export type PostRelationships = Readonly<{
  groups: readonly PostGroupAttributes[]
  memberships: readonly (MembershipAttributes & Pick<typeof groupMember.$inferSelect, "voice">)[]
  positionHoldings: readonly PositionHoldingAttributes[]
}>
export type PostAudienceTarget = Pick<typeof postTarget.$inferSelect, "groupId" | "voiceFamily">
export type PostAddress = { publisherGroupId: string | null; audienceAll: boolean; targets: PostAudienceTarget[] }
type PostContext = Readonly<{
  post: PostAttributes | null
  relationships?: PostRelationships
  targets?: readonly PostAudienceTarget[]
}>
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
type MemberContext = Readonly<{ member: MemberAttributes | null }>

/**
 * The facts required for each action. Supply attributes, never precomputed permission booleans.
 * Null resources represent missing records and deny access. Post contexts include existing resources, relationship facts and proposed publication values.
 */
export type PermissionContext = {
  "memberId.issue": undefined
  "memberId.verify": undefined
  "app.access": undefined
  "post.create": undefined
  "post.read": PostContext
  "post.readAttribution": PostContext
  "post.update": PostContext
  "post.publish": PostContext
  "post.unpublish": PostContext
  "post.discard": PostContext
  "post.address": PostContext & Readonly<{ proposed: PostAddress; publishing: boolean }>
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
