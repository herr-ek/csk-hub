"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/core/db"
import { post } from "@/core/db/schema/posts"
import { logger } from "@/core/logging"
import { newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { POST_PUBLISHING_DENIED, requirePostPublisher } from "./permissions.server"
import { publishPostSchema } from "./schemas"

/** What the Admin typed, echoed back so a rejected submission does not lose the post. */
export type PostDraft = { title: string; body: string }

export type PublishPostState = { status: "idle" } | { status: "error"; error: string; draft: PostDraft }

const RETRY_MESSAGE = "Unable to publish that post right now. Please try again."

function errorState(draft: PostDraft, error: string): PublishPostState {
  return { status: "error", error, draft }
}

export async function publishPost(_state: PublishPostState, formData: FormData): Promise<PublishPostState> {
  const draft: PostDraft = {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? "")
  }

  const input = publishPostSchema.safeParse(draft)
  if (!input.success) {
    return errorState(draft, input.error.issues[0]?.message ?? "Please check the form and try again.")
  }

  let publisherId: string
  try {
    publisherId = (await requirePostPublisher()).memberId
  } catch (error) {
    if (getErrorCode(error) === POST_PUBLISHING_DENIED) {
      return errorState(draft, "Only admins can publish posts.")
    }

    // Reading the session touches the database, so a failure here is not a verdict.
    logger.error("news.post.authorization-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return errorState(draft, RETRY_MESSAGE)
  }

  let publishedId: string
  try {
    const [created] = await db
      .insert(post)
      .values({
        title: input.data.title,
        body: input.data.body,
        authorId: publisherId,
        publishedAt: new Date()
      })
      .returning({ id: post.id })

    if (!created) throw new Error("The post insert returned no row.")
    publishedId = created.id
  } catch (error) {
    logger.error("news.post.publish-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return errorState(draft, RETRY_MESSAGE)
  }

  revalidatePath(ROUTES.news)
  redirect(newsPostPath(publishedId))
}
