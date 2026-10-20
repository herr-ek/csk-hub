import "server-only"

import { eq } from "drizzle-orm"
import {
  AUTHORIZATION_DENIED,
  type AuthorizationDatabase,
  type PermissionRequest,
  requirePermission
} from "@/core/authz"
import { db } from "@/core/db"
import { post } from "@/core/db/schema/posts"
import { logger } from "@/core/logging"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import * as lifecycle from "../lifecycle"
import { isPostId } from "../service"

export type PostWriteResult =
  | { status: "success"; postId: string }
  | { status: "unauthorized" }
  | { status: "failed" }
  | { status: "unavailable" }

function logFailure(event: string, error: unknown) {
  logger.error(event, {
    errorCode: getErrorCode(error),
    errorName: getErrorName(error),
    status: getErrorStatus(error)
  })
}

async function writePost(
  event: "save" | "unpublish" | "discard",
  action: "post.create" | "post.update" | "post.publish" | "post.unpublish" | "post.discard",
  postId: string | null,
  write: (actorId: string, tx: AuthorizationDatabase) => Promise<{ id: string } | null>
): Promise<PostWriteResult> {
  try {
    return await db.transaction(async (tx) => {
      let request: PermissionRequest
      if (action === "post.create") {
        request = { action }
      } else {
        if (!postId || !isPostId(postId)) return { status: "unavailable" as const }
        const [resource] = await tx.select().from(post).where(eq(post.id, postId)).for("update")
        request = { action, context: { post: resource ?? null } }
      }
      const actor = await requirePermission(request, tx)
      const saved = await write(actor.userId, tx)
      return saved ? { status: "success" as const, postId: saved.id } : { status: "unavailable" as const }
    })
  } catch (error) {
    if (getErrorCode(error) === AUTHORIZATION_DENIED) return { status: "unauthorized" }
    logFailure(`news.post.${event}-failed`, error)
    return { status: "failed" }
  }
}

/** Authorize creation for the acting User; content must already satisfy the Post schema. */
export async function createPostCommand(content: lifecycle.PostContent, publish: boolean): Promise<PostWriteResult> {
  return writePost("save", "post.create", null, (authorId, tx) =>
    lifecycle.createPost({ authorId, content, publish }, tx)
  )
}

/** Authorize saving or publishing the acting User's own draft; content must be validated. */
export async function saveDraftCommand(
  postId: string,
  content: lifecycle.PostContent,
  publish: boolean
): Promise<PostWriteResult> {
  return writePost("save", publish ? "post.publish" : "post.update", postId, (authorId, tx) =>
    lifecycle.saveDraft({ postId, authorId, content, publish }, tx)
  )
}

/** Authorize an edit to a published Post; content must already satisfy the Post schema. */
export async function editPublishedPostCommand(
  postId: string,
  content: lifecycle.PostContent
): Promise<PostWriteResult> {
  return writePost("save", "post.update", postId, (_actorId, tx) =>
    lifecycle.editPublishedPost({ postId, content }, tx)
  )
}

/** Authorize recalling a published Post to its author's drafts. */
export async function unpublishPostCommand(postId: string): Promise<PostWriteResult> {
  return writePost("unpublish", "post.unpublish", postId, async (_actorId, tx) =>
    (await lifecycle.unpublishPost(postId, tx)) ? { id: postId } : null
  )
}

/** Authorize discarding the acting User's own draft. */
export async function discardDraftCommand(postId: string): Promise<PostWriteResult> {
  return writePost("discard", "post.discard", postId, async (authorId, tx) =>
    (await lifecycle.discardDraft({ postId, authorId }, tx)) ? { id: postId } : null
  )
}
