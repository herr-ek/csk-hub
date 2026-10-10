"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { publishPostCommand } from "./commands"
import { publishPostSchema } from "./schemas"

/**
 * What the Admin typed, echoed back so a rejected submission does not lose the post.
 * `body` is the editor's document as JSON, exactly as the hidden field carried it.
 */
export type PostDraft = { title: string; body: string }

export type PublishPostError = "formInvalid" | "publishUnauthorized" | "publishFailed"

export type PublishPostState = { status: "idle" } | { status: "error"; error: PublishPostError; draft: PostDraft }

function errorState(draft: PostDraft, error: PublishPostError): PublishPostState {
  return { status: "error", error, draft }
}

export async function publishPost(_state: PublishPostState, formData: FormData): Promise<PublishPostState> {
  const draft: PostDraft = {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? "")
  }

  const input = publishPostSchema.safeParse(draft)
  if (!input.success) {
    return errorState(draft, "formInvalid")
  }

  const result = await publishPostCommand(input.data)
  if (result.status === "unauthorized") return errorState(draft, "publishUnauthorized")
  if (result.status === "failed") return errorState(draft, "publishFailed")

  revalidatePath(ROUTES.news)
  redirect(newsPostPath(result.postId))
}
