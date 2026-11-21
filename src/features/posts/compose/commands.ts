import "server-only"

import { eq } from "drizzle-orm"
import {
  AUTHORIZATION_DENIED,
  type AuthorizationDatabase,
  type PermissionRequest,
  withCurrentRequest
} from "@/core/authz"
import type { PostAddress } from "@/core/authz/model"
import { db } from "@/core/db"
import { post, postTarget } from "@/core/db/schema/posts"
import { logger } from "@/core/logging"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { getPostScope } from "../access"
import * as lifecycle from "../lifecycle"
import { isPostId } from "../service"
import type { UnpublishedTo } from "./unpublished-notice"

export type PostWriteResult<Success extends object = object> =
  | ({ status: "success"; postId: string; revision: number } & Success)
  | { status: "unauthorized" }
  | { status: "failed" }
  | { status: "unavailable" }
  | { status: "conflict" }

type PostSubmission = lifecycle.PostContent & PostAddress
type Dependencies = { database?: AuthorizationDatabase; withAccess?: typeof withCurrentRequest }
type PostAction = "post.create" | "post.update" | "post.publish" | "post.unpublish" | "post.discard"

async function writePost<Saved extends { id: string }>(
  action: PostAction,
  postId: string | null,
  revision: number | undefined,
  content: PostSubmission | undefined,
  publishing: boolean,
  write: (actorId: string, tx: AuthorizationDatabase) => Promise<Saved | null>,
  { database = db, withAccess = withCurrentRequest }: Dependencies
): Promise<PostWriteResult<Omit<Saved, "id">>> {
  try {
    return await withAccess(async (access, tx) => {
      const { actor, relationships } = await getPostScope(tx, access, content)
      if (postId !== null && !isPostId(postId)) return { status: "unavailable" as const }
      const [resource] = postId ? await tx.select().from(post).where(eq(post.id, postId)).for("update") : []
      const targets = postId
        ? await tx
            .select({ groupId: postTarget.groupId, voiceFamily: postTarget.voiceFamily })
            .from(postTarget)
            .where(eq(postTarget.postId, postId))
        : []
      const context = { post: resource ?? null, relationships, targets }
      // Check the existing resource before exposing conflict information or considering new values.
      const request: PermissionRequest =
        action === "post.create" ? { action } : { action: action === "post.publish" ? "post.update" : action, context }
      access.requirePermission(request)
      if (postId && (!resource || !Number.isSafeInteger(revision) || resource.revision !== revision))
        return { status: "conflict" as const }
      if (content) {
        const proposed = {
          publisherGroupId: content.publisherGroupId,
          audienceAll: content.audienceAll,
          targets: content.targets
        }
        access.requirePermission({ action: "post.address", context: { ...context, proposed, publishing } })
        if (action === "post.publish")
          access.requirePermission({
            action,
            context: {
              ...context,
              post: resource ? { ...resource, publisherGroupId: proposed.publisherGroupId } : null
            }
          })
      }
      const saved = await write(actor.userId, tx)
      if (!saved) return { status: "unavailable" as const }
      const { id, ...rest } = saved
      return { status: "success" as const, postId: id, revision: resource ? resource.revision + 1 : 0, ...rest }
    }, database)
  } catch (error) {
    if (getErrorCode(error) === AUTHORIZATION_DENIED) return { status: "unauthorized" }
    logger.error("news.post.write-failed", {
      action,
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "failed" }
  }
}

/** Validate content before calling; identity, relationships and resources are reloaded here. */
export async function createPostCommand(
  content: PostSubmission,
  publish: boolean,
  dependencies: Dependencies = {}
): Promise<PostWriteResult> {
  return writePost(
    "post.create",
    null,
    undefined,
    content,
    publish,
    (authorId, tx) => lifecycle.createPost({ authorId, content, publish }, tx),
    dependencies
  )
}

/** Revision is mandatory for existing resources; stale saves preserve newer content. */
export async function saveDraftCommand(
  postId: string,
  content: PostSubmission,
  publish: boolean,
  revision: number,
  dependencies: Dependencies = {}
): Promise<PostWriteResult> {
  return writePost(
    publish ? "post.publish" : "post.update",
    postId,
    revision,
    content,
    publish,
    (authorId, tx) => lifecycle.saveDraft({ postId, authorId, content, publish }, tx),
    dependencies
  )
}

export async function editPublishedPostCommand(
  postId: string,
  content: PostSubmission,
  revision: number,
  dependencies: Dependencies = {}
): Promise<PostWriteResult> {
  return writePost(
    "post.update",
    postId,
    revision,
    content,
    false,
    (actorId, tx) => lifecycle.editPublishedPost({ postId, actorId, content }, tx),
    dependencies
  )
}

export async function unpublishPostCommand(
  postId: string,
  revision: number,
  dependencies: Dependencies = {}
): Promise<PostWriteResult<{ unpublishedTo: UnpublishedTo }>> {
  return writePost(
    "post.unpublish",
    postId,
    revision,
    undefined,
    false,
    async (actorId, tx) => {
      const recalled = await lifecycle.unpublishPost(postId, tx)
      return recalled
        ? {
            id: postId,
            unpublishedTo: recalled.publisherGroupId
              ? ("group" as const)
              : recalled.authorId === actorId
                ? ("own" as const)
                : ("author" as const)
          }
        : null
    },
    dependencies
  )
}

export async function discardDraftCommand(
  postId: string,
  revision: number,
  dependencies: Dependencies = {}
): Promise<PostWriteResult> {
  return writePost(
    "post.discard",
    postId,
    revision,
    undefined,
    false,
    async (authorId, tx) => ((await lifecycle.discardDraft({ postId, authorId }, tx)) ? { id: postId } : null),
    dependencies
  )
}
