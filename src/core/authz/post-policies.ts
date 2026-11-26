import { GroupType } from "@/core/org-structure"
import { groupPolicies } from "./group-policies"
import type {
  AuthorizationActor,
  AuthorizationPolicies,
  PermissionContext,
  PostGroupAttributes,
  PostRelationships
} from "./model"
import { currentPostMemberships, matchesPostTarget, samePostTargets } from "./post-audience"

/** Exact active Group representation; Choirs cannot publish Posts, including for Admins. */
export function canRepresentPostGroup(
  actor: AuthorizationActor,
  group: PostGroupAttributes | null | undefined,
  relationships?: PostRelationships
): boolean {
  return groupPolicies["group.publishPost"](actor, {
    group: group ?? null,
    positionAppointments: relationships?.positionAppointments ?? [],
    today: relationships?.today
  })
}

/** Current audience-selection authority. This never grants ordinary readership. */
export function canAddressPostGroup(
  actor: AuthorizationActor,
  target: PostGroupAttributes,
  publisher: PostGroupAttributes | null | undefined,
  relationships: PostRelationships
): boolean {
  if (!target.active) return false
  if (actor.isAdmin) return true
  if (publisher?.type === GroupType.Board && canRepresentPostGroup(actor, publisher, relationships)) return true
  const memberships = currentPostMemberships(actor, relationships)
  const memberOf = (id: string | null) => memberships.some((m) => m.groupId === id)
  return (
    memberOf(target.id) ||
    (target.type === GroupType.Section && memberOf(target.choirId)) ||
    (target.type === GroupType.Choir &&
      publisher?.choirId === null &&
      canRepresentPostGroup(actor, publisher, relationships))
  )
}

function managesGroup(actor: AuthorizationActor, context: PermissionContext["post.read"]): boolean {
  const id = context.post?.publisherGroupId
  return Boolean(
    id &&
      (actor.isAdmin ||
        canRepresentPostGroup(
          actor,
          context.relationships?.groups.find((g) => g.id === id),
          context.relationships
        ))
  )
}

function canUpdatePost(actor: AuthorizationActor, context: PermissionContext["post.update"]): boolean {
  const { post } = context
  if (!post || post.discardedAt !== null) return false
  if (post.firstPublishedAt === null && post.publishedAt === null) return post.authorId === actor.userId
  if (post.publisherGroupId) return managesGroup(actor, context)
  return post.authorId === actor.userId || (post.publishedAt !== null && actor.isAdmin)
}

function canReadPost(actor: AuthorizationActor, context: PermissionContext["post.read"]): boolean {
  const { post, relationships, targets } = context
  if (!post || post.discardedAt !== null) return false
  if (post.publishedAt === null) return canUpdatePost(actor, context)
  if (
    actor.isAdmin ||
    (post.publisherGroupId === null && post.authorId === actor.userId) ||
    managesGroup(actor, context)
  )
    return true
  return (
    post.audienceAll ||
    Boolean(relationships && targets?.some((target) => matchesPostTarget(actor, target, relationships)))
  )
}

function canPublishPost(actor: AuthorizationActor, context: PermissionContext["post.publish"]): boolean {
  const { post, relationships } = context
  if (!post || post.publishedAt !== null || !canUpdatePost(actor, context)) return false
  return (
    post.publisherGroupId === null ||
    canRepresentPostGroup(
      actor,
      relationships?.groups.find((g) => g.id === post.publisherGroupId),
      relationships
    )
  )
}

function canAddressPost(actor: AuthorizationActor, context: PermissionContext["post.address"]): boolean {
  const { post, proposed, relationships, publishing, targets = [] } = context
  if (!relationships) return false
  if (post && !canUpdatePost(actor, context)) return false
  const publisher = relationships.groups.find((g) => g.id === proposed.publisherGroupId)
  const fixed = post && (post.firstPublishedAt !== null || post.publishedAt !== null)
  if (fixed && post.publisherGroupId !== proposed.publisherGroupId) return false
  // Existing archived publishers may be edited or recalled by Admin, but never republished.
  if (
    proposed.publisherGroupId !== null &&
    (publishing || !fixed) &&
    !canRepresentPostGroup(actor, publisher, relationships)
  )
    return false
  if (proposed.audienceAll && proposed.targets.length > 0) return false
  if ((publishing || post?.publishedAt) && !proposed.audienceAll && proposed.targets.length === 0) return false
  const unchanged =
    post &&
    post.publisherGroupId === proposed.publisherGroupId &&
    post.audienceAll === proposed.audienceAll &&
    samePostTargets(targets, proposed.targets)
  if (!publishing && unchanged) return true
  return proposed.targets.every((rule) => {
    if (rule.groupId === null) return rule.voiceFamily !== null
    const target = relationships.groups.find((g) => g.id === rule.groupId)
    return target && canAddressPostGroup(actor, target, publisher, relationships)
  })
}

export const postPolicies = {
  "post.create": () => true,
  "post.read": canReadPost,
  "post.readAttribution": (actor, context) =>
    canReadPost(actor, context) && (context.post?.publisherGroupId === null || managesGroup(actor, context)),
  "post.update": canUpdatePost,
  "post.publish": canPublishPost,
  "post.address": canAddressPost,
  "post.unpublish": (actor, context) => context.post?.publishedAt != null && canUpdatePost(actor, context),
  "post.discard": (actor, context) =>
    context.post?.publishedAt === null &&
    (context.post.publisherGroupId === null || context.post.firstPublishedAt === null) &&
    canUpdatePost(actor, context)
} satisfies Pick<AuthorizationPolicies, `post.${string}` & keyof AuthorizationPolicies>
