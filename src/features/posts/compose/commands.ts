import { AUTHORIZATION_DENIED, requireCurrentUserPermission } from "@/core/auth/permissions.server"
import { db } from "@/core/db"
import { post } from "@/core/db/schema/posts"
import { logger } from "@/core/logging"
import type { RichTextDocument } from "@/features/rich-text"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"

type PublishInput = { title: string; body: RichTextDocument }
type PublishResult = { status: "success"; postId: string } | { status: "unauthorized" } | { status: "failed" }

/** Authorize and persist a published Post; the action adapter owns form state and navigation. */
export async function publishPostCommand(input: PublishInput): Promise<PublishResult> {
  let publisherId: string
  try {
    publisherId = (await requireCurrentUserPermission({ resource: "post", action: "create" })).userId
  } catch (error) {
    if (getErrorCode(error) === AUTHORIZATION_DENIED) return { status: "unauthorized" }

    logger.error("news.post.authorization-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "failed" }
  }

  try {
    const [created] = await db
      .insert(post)
      .values({
        title: input.title,
        body: input.body,
        authorId: publisherId,
        publishedAt: new Date()
      })
      .returning({ id: post.id })

    if (!created) throw new Error("The post insert returned no row.")
    return { status: "success", postId: created.id }
  } catch (error) {
    logger.error("news.post.publish-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "failed" }
  }
}
