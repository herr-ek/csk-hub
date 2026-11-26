import type { user } from "@/core/db/schema/auth"
import type { event } from "@/core/db/schema/events"
import type { group, positionAppointment } from "@/core/db/schema/org-structure"
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

/** Dated appointments use Stockholm calendar dates and exclusive end boundaries. */
export type PositionAppointmentAttributes = Readonly<
  Pick<typeof positionAppointment.$inferSelect, "userId" | "contextGroupId" | "positionCode" | "startDate" | "endDate">
>

export type PostGroupAttributes = GroupAttributes & Readonly<{ choirId: string | null }>
export type PostRelationships = Readonly<{
  today: string
  groups: readonly PostGroupAttributes[]
  memberships: readonly (Pick<AudienceMembership, "groupId" | "voice" | "startDate" | "endDate"> & { userId: string })[]
  positionAppointments: readonly PositionAppointmentAttributes[]
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
    positionAppointments: readonly PositionAppointmentAttributes[]
  }>
/** Every Group's type and state, so a policy can tell which appointments and Targets name the Board or a Choir. */
type GroupCatalogueContext = Readonly<{ groups: readonly GroupAttributes[] }>
type RehearsalScheduleContext = GroupCatalogueContext &
  Readonly<{ positionAppointments: readonly PositionAppointmentAttributes[] }>
export type EventAttributes = Readonly<Pick<typeof event.$inferSelect, "id" | "organiserGroupId" | "type" | "seriesId">>
type EventContext = GroupWorkContext &
  GroupCatalogueContext &
  Readonly<{ event: EventAttributes | null; targets: readonly AudienceTarget[] }>
/** What an update would make the Event: the Board may only keep it a Choir's Series Rehearsal. */
export type ProposedEventAttributes = Readonly<{
  type: (typeof event.$inferSelect)["type"]
  targets: readonly AudienceTarget[]
}>

export type EventViewAttributes = EventAttributes &
  Readonly<Pick<typeof event.$inferSelect, "type" | "status" | "startsAt">>
type EventViewContext = Omit<EventContext, "event"> &
  Readonly<{
    event: EventViewAttributes | null
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
  "group.publishPost": GroupWorkContext & Readonly<{ today?: string }>
  "group.manageContent": GroupWorkContext
  "group.manageEvents": GroupWorkContext
  "group.manageMemberships": GroupContext
  "group.managePositions": GroupContext
  "member.read": MemberContext
  "member.readEmail": MemberContext
  "member.editProfile": MemberContext
  "oidcClient.manage": undefined
  "admin.access": undefined
  "event.create": GroupWorkContext
  "event.read": EventContext
  "event.view": EventViewContext
  "event.update": EventContext &
    Readonly<{ proposedOrganiser: GroupWorkContext; proposedEvent: ProposedEventAttributes }>
  "event.changeStatus": EventContext
  "event.delete": EventContext
  "event.administer": undefined
  "event.scheduleRehearsals": RehearsalScheduleContext
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
