import "server-only"

import { and, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import type { AuthorizationDatabase, RequestAuthorization } from "@/core/authz"
import type { AuthorizationActor, PostAddress, PostRelationships } from "@/core/authz/model"
import { matchesPostTarget } from "@/core/authz/post-audience"
import { canRepresentPostGroup } from "@/core/authz/post-policies"
import { post, postTarget } from "@/core/db/schema/posts"
import { lockCurrentGroupAuthorizationFacts, type OrgStructureTransaction } from "@/features/org-structure"

/** Fresh identity and relationship/archive locks, acquired before any Post lock. */
export async function getPostScope(
  database: OrgStructureTransaction,
  access: RequestAuthorization,
  address?: PostAddress
) {
  const actor = access.requirePermission({ action: "app.access" })
  const groupIds = address
    ? [address.publisherGroupId, ...address.targets.map((target) => target.groupId)].filter((id) => id !== null)
    : []
  const relationships = await lockCurrentGroupAuthorizationFacts(database, actor.userId, groupIds)
  return { actor, relationships }
}

export function managedPostGroupIds(actor: AuthorizationActor, relationships: PostRelationships) {
  return relationships.groups.filter((g) => canRepresentPostGroup(actor, g, relationships)).map((g) => g.id)
}

/** SQL equivalent of post.read for published content; shared by every collection and unread query. */
export function publishedPostVisibility(
  database: AuthorizationDatabase,
  actor: AuthorizationActor,
  relationships: PostRelationships
) {
  const memberIds = relationships.memberships
    .filter((m) => m.userId === actor.userId && m.endDate === null)
    .map((m) => m.groupId)
  const voiceMatches = (["S", "A", "T", "B"] as const).map((voiceFamily) => {
    const scopes = relationships.groups
      .filter((g) => matchesPostTarget(actor, { groupId: g.id, voiceFamily }, relationships))
      .map((g) => g.id)
    const cskWide = matchesPostTarget(actor, { groupId: null, voiceFamily }, relationships)
    return and(
      sql`${postTarget.voiceFamily}::voice = ${voiceFamily}::voice`,
      or(cskWide ? isNull(postTarget.groupId) : sql`false`, inArray(postTarget.groupId, scopes))
    )
  })
  return and(
    isNotNull(post.publishedAt),
    isNull(post.discardedAt),
    actor.isAdmin
      ? sql`true`
      : or(
          post.audienceAll,
          and(isNull(post.publisherGroupId), eq(post.authorId, actor.userId)),
          inArray(post.publisherGroupId, managedPostGroupIds(actor, relationships)),
          exists(
            database
              .select({ id: postTarget.postId })
              .from(postTarget)
              .where(
                and(
                  eq(postTarget.postId, post.id),
                  or(isNull(postTarget.groupId), inArray(postTarget.groupId, memberIds)),
                  or(isNull(postTarget.voiceFamily), ...voiceMatches)
                )
              )
          )
        )
  )
}

/** Unpublished personal/private Drafts and shared Recalled Group Posts the actor can manage. */
export function editableUnpublishedVisibility(actor: AuthorizationActor, relationships: PostRelationships) {
  return and(
    isNull(post.publishedAt),
    isNull(post.discardedAt),
    or(
      and(eq(post.authorId, actor.userId), or(isNull(post.firstPublishedAt), isNull(post.publisherGroupId))),
      and(
        isNotNull(post.firstPublishedAt),
        isNotNull(post.publisherGroupId),
        actor.isAdmin ? sql`true` : inArray(post.publisherGroupId, managedPostGroupIds(actor, relationships))
      )
    )
  )
}
