import type { AuthorizationActor, AuthorizationPolicies, PermissionContext } from "./model"

function canReadPost(actor: AuthorizationActor, { post }: PermissionContext["post.read"]): boolean {
  if (!post || post.discardedAt !== null) return false
  return post.publishedAt !== null || post.authorId === actor.userId
}

function canUpdatePost(actor: AuthorizationActor, { post }: PermissionContext["post.update"]): boolean {
  if (!post || post.discardedAt !== null) return false
  // Admin authority applies to published content, never another author's private Draft.
  return post.authorId === actor.userId || (post.publishedAt !== null && actor.isAdmin)
}

function canPublishPost(actor: AuthorizationActor, { post }: PermissionContext["post.publish"]): boolean {
  return post !== null && post.discardedAt === null && post.publishedAt === null && post.authorId === actor.userId
}

function canUnpublishPost(actor: AuthorizationActor, { post }: PermissionContext["post.unpublish"]): boolean {
  return (
    post !== null &&
    post.discardedAt === null &&
    post.publishedAt !== null &&
    (post.authorId === actor.userId || actor.isAdmin)
  )
}

function canDiscardPost(actor: AuthorizationActor, { post }: PermissionContext["post.discard"]): boolean {
  return post !== null && post.discardedAt === null && post.publishedAt === null && post.authorId === actor.userId
}

/** Personal Post policies. The evaluator requires an active actor before invoking any policy. */
export const postPolicies = {
  "post.create": () => true,
  "post.read": canReadPost,
  "post.update": canUpdatePost,
  "post.publish": canPublishPost,
  "post.unpublish": canUnpublishPost,
  "post.discard": canDiscardPost
} satisfies Pick<AuthorizationPolicies, `post.${string}` & keyof AuthorizationPolicies>
