"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { PostAudienceTarget } from "@/core/authz/model"
import { newsPostEditPath, newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { scheduleActivityDispatch } from "@/features/messaging/activity"
import { validationMessageIds } from "@/shared/schemas"
import {
  createPostCommand,
  discardDraftCommand,
  editPublishedPostCommand,
  type PostWriteResult,
  saveDraftCommand,
  unpublishPostCommand
} from "./commands"
import { type PostFormInput, parsePostTargets, postFormSchema } from "./schemas"
import { UNPUBLISHED_NOTICE_PARAM } from "./unpublished-notice"

/**
 * What the Member typed, echoed back so a rejected submission does not lose the post.
 * `body` is the editor's document as JSON, exactly as the hidden field carried it.
 */
export type PostFormValues = {
  title: string
  body: string
  publisherGroupId: string
  audienceAll: boolean
  targets: PostAudienceTarget[] | null
  revision?: string
}

export type PostFormError = "formInvalid" | "writeUnauthorized" | "saveFailed" | "postUnavailable" | "editConflict"

export type PostFormState =
  | { status: "idle" }
  | { status: "saved"; revision: number; values: PostFormValues }
  | { status: "error"; error: PostFormError; values: PostFormValues; targetErrors?: number[] }

/** A change of state confirmed in a dialog — unpublishing, discarding — rather than a form. */
export type PostCommand = "unpublish" | "discard"

export type PostCommandError =
  | "writeUnauthorized"
  | "unpublishFailed"
  | "discardFailed"
  | "postUnavailable"
  | "editConflict"

export type PostCommandState = { status: "idle" } | { status: "error"; error: PostCommandError }

/** Which submit button sent the form. Anything but an explicit publish keeps a draft. */
function publishRequested(formData: FormData): boolean {
  return formData.get("intent") === "publish"
}

function readValues(formData: FormData): PostFormValues {
  return {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    publisherGroupId: String(formData.get("publisherGroupId") ?? ""),
    audienceAll: formData.get("audience") === "all",
    targets: parsePostTargets(String(formData.get("targets") ?? "[]")),
    revision: formData.has("revision") ? String(formData.get("revision")) : undefined
  }
}

/**
 * The shared shape of every form submission: validate before authorizing, authorize the
 * write, run it, and hand the Member their post back on any failure. On success the write
 * names the Post saved, and the caller says where the Member goes next.
 */
async function submitPost(
  formData: FormData,
  write: (content: PostFormInput) => Promise<PostWriteResult>
): Promise<{ state: PostFormState } | { savedId: string; revision: number; values: PostFormValues }> {
  const values = readValues(formData)
  const errorState = (error: PostFormError) => ({ state: { status: "error" as const, error, values } })

  const input = postFormSchema.safeParse(values)
  if (!input.success) {
    const targetErrors = input.error.issues.flatMap((issue) =>
      issue.message === validationMessageIds.audienceTargetIncomplete && typeof issue.path[1] === "number"
        ? [issue.path[1]]
        : []
    )
    return {
      state: { status: "error", error: "formInvalid", values, ...(targetErrors.length ? { targetErrors } : {}) }
    }
  }

  const result = await write(input.data)
  if (result.status === "unauthorized") return errorState("writeUnauthorized")
  if (result.status === "failed") return errorState("saveFailed")
  if (result.status === "unavailable") return errorState("postUnavailable")
  if (result.status === "conflict") return errorState("editConflict")
  return { savedId: result.postId, revision: result.revision, values }
}

function revalidatePost(postId: string, publishedChanged: boolean) {
  if (publishedChanged) scheduleActivityDispatch()
  revalidatePath(ROUTES.home)
  revalidatePath(ROUTES.news)
  revalidatePath(newsPostPath(postId))
}

/** Writes a new Post: published straight to the feed, or kept as the author's draft. */
export async function createPost(_state: PostFormState, formData: FormData): Promise<PostFormState> {
  const publish = publishRequested(formData)
  const result = await submitPost(formData, (content) => createPostCommand(content, publish))
  if ("state" in result) return result.state

  revalidatePost(result.savedId, publish)
  redirect(publish ? newsPostPath(result.savedId) : newsPostEditPath(result.savedId))
}

/**
 * Saves the authorized unpublished Post, or publishes it. A saved draft reloads its edit page,
 * which then shows when it was saved.
 */
export async function saveDraft(postId: string, _state: PostFormState, formData: FormData): Promise<PostFormState> {
  const publish = publishRequested(formData)
  const result = await submitPost(formData, (content) => saveDraftCommand(postId, content, publish, content.revision))
  if ("state" in result) return result.state

  revalidatePost(result.savedId, publish)
  if (publish) redirect(newsPostPath(result.savedId))
  revalidatePath(newsPostEditPath(result.savedId))
  return { status: "saved", revision: result.revision, values: result.values }
}

/** Changes a published Post, with current editing authority. Readers see the change at once. */
export async function editPublishedPost(
  postId: string,
  _state: PostFormState,
  formData: FormData
): Promise<PostFormState> {
  const result = await submitPost(formData, (content) => editPublishedPostCommand(postId, content, content.revision))
  if ("state" in result) return result.state

  revalidatePost(result.savedId, true)
  redirect(newsPostPath(result.savedId))
}

/**
 * The shared shape of a confirmed command: authorize, run it, and send the User where the
 * command resolves — the feed, unless it names another destination. A command that finds the Post in another state resolves null
 * and reports it unavailable.
 */
async function runCommand<Success extends object>(
  postId: string,
  command: PostCommand,
  run: () => Promise<PostWriteResult<Success>>,
  destination: (result: { postId: string } & Success) => string = () => ROUTES.news
): Promise<PostCommandState> {
  const failed = command === "unpublish" ? "unpublishFailed" : "discardFailed"

  const result = await run()
  if (result.status === "unauthorized") return { status: "error", error: "writeUnauthorized" }
  if (result.status === "failed") return { status: "error", error: failed }
  if (result.status === "unavailable") return { status: "error", error: "postUnavailable" }
  if (result.status === "conflict") return { status: "error", error: "editConflict" }

  revalidatePost(postId, command === "unpublish")
  redirect(destination(result))
}

/**
 * Recall personal content to its private Draft or Group content to its shared recalled state.
 * The feed confirms which unpublished collection received it.
 */
export async function unpublishPost(
  postId: string,
  _state: PostCommandState,
  formData: FormData
): Promise<PostCommandState> {
  return runCommand(
    postId,
    "unpublish",
    () => unpublishPostCommand(postId, readRevision(formData)),
    ({ unpublishedTo }) => `${ROUTES.news}?${UNPUBLISHED_NOTICE_PARAM}=${unpublishedTo}`
  )
}

/** Discards the author's private Draft and leaves the retained row hidden. */
export async function discardDraft(
  postId: string,
  _state: PostCommandState,
  formData: FormData
): Promise<PostCommandState> {
  return runCommand(postId, "discard", () => discardDraftCommand(postId, readRevision(formData)))
}

function readRevision(formData: FormData): number | undefined {
  const value = formData.get("revision")
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined
}
