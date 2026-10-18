"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AUTHORIZATION_DENIED, requireCurrentUserPermission } from "@/core/auth/permissions.server"
import { logger } from "@/core/logging"
import { newsPostEditPath, newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import * as lifecycle from "../lifecycle"
import { postFormSchema } from "./schemas"

/**
 * What the Admin typed, echoed back so a rejected submission does not lose the post.
 * `body` is the editor's document as JSON, exactly as the hidden field carried it.
 */
export type PostFormValues = { title: string; body: string }

export type PostFormError = "formInvalid" | "writeUnauthorized" | "saveFailed" | "postUnavailable"

export type PostFormState = { status: "idle" } | { status: "error"; error: PostFormError; values: PostFormValues }

/** A change of state confirmed in a dialog — unpublishing, discarding — rather than a form. */
export type PostCommand = "unpublish" | "discard"

export type PostCommandError = "writeUnauthorized" | "unpublishFailed" | "discardFailed" | "postUnavailable"

export type PostCommandState = { status: "idle" } | { status: "error"; error: PostCommandError }

type PostWrite = "create" | "update"

/** Which submit button sent the form. Anything but an explicit publish keeps a draft. */
function publishRequested(formData: FormData): boolean {
  return formData.get("intent") === "publish"
}

function readValues(formData: FormData): PostFormValues {
  return { title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? "") }
}

function logFailure(event: string, error: unknown) {
  logger.error(event, {
    errorCode: getErrorCode(error),
    errorName: getErrorName(error),
    status: getErrorStatus(error)
  })
}

/** The acting User's id, or why they may not write. A failed lookup is not a verdict. */
async function authorize(action: PostWrite): Promise<{ userId: string } | { error: "writeUnauthorized" | "failed" }> {
  try {
    const { userId } = await requireCurrentUserPermission({ resource: "post", action })
    return { userId }
  } catch (error) {
    if (getErrorCode(error) === AUTHORIZATION_DENIED) return { error: "writeUnauthorized" }

    // Reading the session touches the database, so a failure here is not a verdict.
    logFailure("news.post.authorization-failed", error)
    return { error: "failed" }
  }
}

/**
 * The shared shape of every form submission: validate before authorizing, authorize the
 * write, run it, and hand the Admin their post back on any failure. On success the write
 * names the Post saved, and the caller says where the Admin goes next.
 */
async function submitPost(
  formData: FormData,
  action: PostWrite,
  write: (actorId: string, content: lifecycle.PostContent) => Promise<{ id: string } | null>
): Promise<{ state: PostFormState } | { savedId: string }> {
  const values = readValues(formData)
  const errorState = (error: PostFormError) => ({ state: { status: "error" as const, error, values } })

  const input = postFormSchema.safeParse(values)
  if (!input.success) return errorState("formInvalid")

  const actor = await authorize(action)
  if ("error" in actor) return errorState(actor.error === "failed" ? "saveFailed" : actor.error)

  let saved: { id: string } | null
  try {
    saved = await write(actor.userId, input.data)
  } catch (error) {
    logFailure("news.post.save-failed", error)
    return errorState("saveFailed")
  }

  if (!saved) return errorState("postUnavailable")
  return { savedId: saved.id }
}

function revalidatePost(postId: string) {
  revalidatePath(ROUTES.news)
  revalidatePath(newsPostPath(postId))
}

/** Writes a new Post: published straight to the feed, or kept as the author's draft. */
export async function createPost(_state: PostFormState, formData: FormData): Promise<PostFormState> {
  const publish = publishRequested(formData)
  const result = await submitPost(formData, "create", (authorId, content) =>
    lifecycle.createPost({ authorId, content, publish })
  )
  if ("state" in result) return result.state

  revalidatePost(result.savedId)
  redirect(publish ? newsPostPath(result.savedId) : newsPostEditPath(result.savedId))
}

/**
 * Saves the acting Admin's own draft, or publishes it. A saved draft reloads its edit page,
 * which then shows when it was saved.
 */
export async function saveDraft(postId: string, _state: PostFormState, formData: FormData): Promise<PostFormState> {
  const publish = publishRequested(formData)
  const result = await submitPost(formData, "create", (authorId, content) =>
    lifecycle.saveDraft({ postId, authorId, content, publish })
  )
  if ("state" in result) return result.state

  revalidatePost(result.savedId)
  redirect(publish ? newsPostPath(result.savedId) : newsPostEditPath(result.savedId))
}

/** Changes a published Post, whoever wrote it. Members see the change at once. */
export async function editPublishedPost(
  postId: string,
  _state: PostFormState,
  formData: FormData
): Promise<PostFormState> {
  const result = await submitPost(formData, "update", (_actorId, content) =>
    lifecycle.editPublishedPost({ postId, content })
  )
  if ("state" in result) return result.state

  revalidatePost(result.savedId)
  redirect(newsPostPath(result.savedId))
}

/**
 * The shared shape of a confirmed command: authorize, run it, and send the Admin back to
 * the feed. A command that finds the Post in another state reports it unavailable.
 */
async function runCommand(
  postId: string,
  command: PostCommand,
  action: PostWrite,
  run: (actorId: string) => Promise<boolean>
): Promise<PostCommandState> {
  const failed = command === "unpublish" ? "unpublishFailed" : "discardFailed"

  const actor = await authorize(action)
  if ("error" in actor) return { status: "error", error: actor.error === "failed" ? failed : actor.error }

  let done: boolean
  try {
    done = await run(actor.userId)
  } catch (error) {
    logFailure(`news.post.${command}-failed`, error)
    return { status: "error", error: failed }
  }

  if (!done) return { status: "error", error: "postUnavailable" }

  revalidatePost(postId)
  redirect(ROUTES.news)
}

/** Recalls a published Post from the feed and its permalink, back to its author's drafts. */
export async function unpublishPost(postId: string, _state: PostCommandState): Promise<PostCommandState> {
  return runCommand(postId, "unpublish", "update", () => lifecycle.unpublishPost(postId))
}

/** Throws away the acting Admin's own draft. It is hidden for good, never deleted. */
export async function discardDraft(postId: string, _state: PostCommandState): Promise<PostCommandState> {
  return runCommand(postId, "discard", "create", (authorId) => lifecycle.discardDraft({ postId, authorId }))
}
