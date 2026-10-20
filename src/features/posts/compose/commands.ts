import "server-only"

import { AUTHORIZATION_DENIED, requireAdmin } from "@/core/auth/permissions.server"
import { logger } from "@/core/logging"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import * as lifecycle from "../lifecycle"

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
  write: (actorId: string) => Promise<{ id: string } | null>
): Promise<PostWriteResult> {
  let actorId: string
  try {
    actorId = (await requireAdmin()).userId
  } catch (error) {
    if (getErrorCode(error) === AUTHORIZATION_DENIED) return { status: "unauthorized" }

    // Reading the session touches the database, so a failure here is not a verdict.
    logFailure("news.post.authorization-failed", error)
    return { status: "failed" }
  }

  try {
    const saved = await write(actorId)
    return saved ? { status: "success", postId: saved.id } : { status: "unavailable" }
  } catch (error) {
    logFailure(`news.post.${event}-failed`, error)
    return { status: "failed" }
  }
}

/** Authorize creation for the acting User; content must already satisfy the Post schema. */
export async function createPostCommand(content: lifecycle.PostContent, publish: boolean): Promise<PostWriteResult> {
  return writePost("save", (authorId) => lifecycle.createPost({ authorId, content, publish }))
}

/** Authorize saving or publishing the acting User's own draft; content must be validated. */
export async function saveDraftCommand(
  postId: string,
  content: lifecycle.PostContent,
  publish: boolean
): Promise<PostWriteResult> {
  return writePost("save", (authorId) => lifecycle.saveDraft({ postId, authorId, content, publish }))
}

/** Authorize an edit to a published Post; content must already satisfy the Post schema. */
export async function editPublishedPostCommand(
  postId: string,
  content: lifecycle.PostContent
): Promise<PostWriteResult> {
  return writePost("save", () => lifecycle.editPublishedPost({ postId, content }))
}

/** Authorize recalling a published Post to its author's drafts. */
export async function unpublishPostCommand(postId: string): Promise<PostWriteResult> {
  return writePost("unpublish", async () => ((await lifecycle.unpublishPost(postId)) ? { id: postId } : null))
}

/** Authorize discarding the acting User's own draft. */
export async function discardDraftCommand(postId: string): Promise<PostWriteResult> {
  return writePost("discard", async (authorId) =>
    (await lifecycle.discardDraft({ postId, authorId })) ? { id: postId } : null
  )
}
