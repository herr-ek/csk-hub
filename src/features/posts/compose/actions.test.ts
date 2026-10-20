import { beforeEach, describe, expect, mock, test } from "bun:test"
import { AuthorizationDeniedError } from "@/core/authz/authorization"

const POST_ID = "11111111-1111-4111-8111-111111111111"

const requirePermission = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const tx = {}
mock.module("@/core/db", () => ({ db: { transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx) } }))
const revalidatePath = mock(() => undefined)
const redirect = mock((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`)
})
const createPost = mock(async (): Promise<{ id: string }> => ({ id: POST_ID }))
const saveDraft = mock(async (): Promise<{ id: string } | null> => ({ id: POST_ID }))
const editPublishedPost = mock(async (): Promise<{ id: string } | null> => ({ id: POST_ID }))
const unpublishPost = mock(async () => true)
const discardDraft = mock(async () => true)
const loggerError = mock(() => undefined)

class DeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED"
}

mock.module("@/core/authz", () => ({
  requirePermission,
  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
  AuthorizationDeniedError
}))
mock.module("../lifecycle", () => ({ createPost, saveDraft, editPublishedPost, unpublishPost, discardDraft }))
mock.module("@/core/logging", () => ({ logger: { error: loggerError } }))
mock.module("next/cache", () => ({ revalidatePath }))
mock.module("next/navigation", () => ({ redirect }))

import * as actions from "./actions"

const TITLE = "Höstkonsert"
/** The document as the editor's hidden field carries it. */
const BODY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Vi sjunger i Vasakyrkan." }] }]
}
const BODY = JSON.stringify(BODY_DOCUMENT)
const CONTENT = { title: TITLE, body: BODY_DOCUMENT }
const IDLE = { status: "idle" } as const

function postFormData({ title = TITLE, body = BODY, intent }: { title?: string; body?: string; intent?: string } = {}) {
  const data = new FormData()
  data.set("title", title)
  data.set("body", body)
  if (intent) data.set("intent", intent)
  return data
}

beforeEach(() => {
  for (const fn of [requirePermission, revalidatePath, redirect, loggerError]) fn.mockClear()
  requirePermission.mockResolvedValue({ state: "authenticated", userId: "admin-1" })
  createPost.mockReset()
  createPost.mockResolvedValue({ id: POST_ID })
  saveDraft.mockReset()
  saveDraft.mockResolvedValue({ id: POST_ID })
  editPublishedPost.mockReset()
  editPublishedPost.mockResolvedValue({ id: POST_ID })
  unpublishPost.mockReset()
  unpublishPost.mockResolvedValue(true)
  discardDraft.mockReset()
  discardDraft.mockResolvedValue(true)
})

describe("writing a new Post", () => {
  test("publishes it against its author and sends the Admin to its permalink", async () => {
    await expect(actions.createPost(IDLE, postFormData({ intent: "publish" }))).rejects.toThrow(
      `NEXT_REDIRECT:/news/${POST_ID}`
    )

    expect(requirePermission).toHaveBeenCalledWith({ action: "post.create" }, tx)
    expect(createPost).toHaveBeenCalledWith({ authorId: "admin-1", content: CONTENT, publish: true }, tx)
    expect(revalidatePath).toHaveBeenCalledWith("/news")
  })

  test("keeps it as a draft and opens it for further writing", async () => {
    await expect(actions.createPost(IDLE, postFormData({ intent: "draft" }))).rejects.toThrow(
      `NEXT_REDIRECT:/news/${POST_ID}/edit`
    )

    expect(createPost).toHaveBeenCalledWith({ authorId: "admin-1", content: CONTENT, publish: false }, tx)
  })

  test("publishes only when Publish was pressed, never by default", async () => {
    await expect(actions.createPost(IDLE, postFormData())).rejects.toThrow(`NEXT_REDIRECT:/news/${POST_ID}/edit`)

    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ publish: false }), tx)
  })

  test("refuses a User without the post:create permission, without writing anything", async () => {
    requirePermission.mockRejectedValue(new DeniedError())

    await expect(actions.createPost(IDLE, postFormData({ intent: "publish" }))).resolves.toEqual({
      status: "error",
      error: "writeUnauthorized",
      values: { title: TITLE, body: BODY }
    })

    expect(createPost).not.toHaveBeenCalled()
  })

  test("treats a failed authorization lookup as retryable rather than a refusal", async () => {
    requirePermission.mockRejectedValue(new Error("connection refused"))

    await expect(actions.createPost(IDLE, postFormData())).resolves.toEqual({
      status: "error",
      error: "saveFailed",
      values: { title: TITLE, body: BODY }
    })

    expect(loggerError).toHaveBeenCalledTimes(1)
    expect(createPost).not.toHaveBeenCalled()
  })

  test("stores what the Post schema allows, not what the browser sent", async () => {
    const smuggled = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Not a title" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }]
        }
      ]
    })

    await expect(actions.createPost(IDLE, postFormData({ body: smuggled }))).rejects.toThrow("NEXT_REDIRECT")

    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        content: {
          title: TITLE,
          body: {
            type: "doc",
            content: [
              { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Not a title" }] },
              { type: "paragraph", content: [{ type: "text", text: "click" }] }
            ]
          }
        }
      }),
      tx
    )
  })

  test("refuses a body that is not a Post document, without authorizing anything", async () => {
    const plainText = "Plain text from the old textarea"

    await expect(actions.createPost(IDLE, postFormData({ body: plainText }))).resolves.toEqual({
      status: "error",
      error: "formInvalid",
      values: { title: TITLE, body: plainText }
    })

    expect(requirePermission).not.toHaveBeenCalled()
    expect(createPost).not.toHaveBeenCalled()
  })

  test("requires a title and a body before authorizing anything", async () => {
    await expect(actions.createPost(IDLE, postFormData({ title: "   " }))).resolves.toMatchObject({
      error: "formInvalid",
      values: { title: "   ", body: BODY }
    })
    await expect(actions.createPost(IDLE, postFormData({ body: "  " }))).resolves.toMatchObject({
      error: "formInvalid",
      values: { title: TITLE, body: "  " }
    })

    expect(requirePermission).not.toHaveBeenCalled()
    expect(createPost).not.toHaveBeenCalled()
  })

  test("hands the Admin their post back when the write fails", async () => {
    createPost.mockRejectedValue(new Error("connection refused"))

    await expect(actions.createPost(IDLE, postFormData({ intent: "publish" }))).resolves.toEqual({
      status: "error",
      error: "saveFailed",
      values: { title: TITLE, body: BODY }
    })

    expect(redirect).not.toHaveBeenCalled()
  })
})

describe("working on a draft", () => {
  test("saves it as the acting Admin's own draft and reloads its edit page", async () => {
    await expect(actions.saveDraft(POST_ID, IDLE, postFormData({ intent: "draft" }))).rejects.toThrow(
      `NEXT_REDIRECT:/news/${POST_ID}/edit`
    )

    expect(requirePermission).toHaveBeenCalledWith({ action: "post.update", postId: POST_ID }, tx)
    expect(saveDraft).toHaveBeenCalledWith(
      { postId: POST_ID, authorId: "admin-1", content: CONTENT, publish: false },
      tx
    )
  })

  test("publishes it explicitly and sends the Admin to its permalink", async () => {
    await expect(actions.saveDraft(POST_ID, IDLE, postFormData({ intent: "publish" }))).rejects.toThrow(
      `NEXT_REDIRECT:/news/${POST_ID}`
    )

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ publish: true }), tx)
  })

  test("says the Post is gone when it is no longer a draft of theirs", async () => {
    saveDraft.mockResolvedValue(null)

    await expect(actions.saveDraft(POST_ID, IDLE, postFormData({ intent: "publish" }))).resolves.toEqual({
      status: "error",
      error: "postUnavailable",
      values: { title: TITLE, body: BODY }
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe("editing a published Post", () => {
  test("needs post:update, changes the Post and returns to its permalink", async () => {
    await expect(actions.editPublishedPost(POST_ID, IDLE, postFormData())).rejects.toThrow(
      `NEXT_REDIRECT:/news/${POST_ID}`
    )

    expect(requirePermission).toHaveBeenCalledWith({ action: "post.update", postId: POST_ID }, tx)
    expect(editPublishedPost).toHaveBeenCalledWith({ postId: POST_ID, content: CONTENT }, tx)
    expect(revalidatePath).toHaveBeenCalledWith(`/news/${POST_ID}`)
  })

  test("refuses a User without post:update, without writing anything", async () => {
    requirePermission.mockRejectedValue(new DeniedError())

    await expect(actions.editPublishedPost(POST_ID, IDLE, postFormData())).resolves.toMatchObject({
      error: "writeUnauthorized"
    })
    expect(editPublishedPost).not.toHaveBeenCalled()
  })

  test("says the Post is gone when it was unpublished in the meantime", async () => {
    editPublishedPost.mockResolvedValue(null)

    await expect(actions.editPublishedPost(POST_ID, IDLE, postFormData())).resolves.toMatchObject({
      error: "postUnavailable",
      values: { title: TITLE, body: BODY }
    })
  })
})

describe("unpublishing a Post", () => {
  test("needs post:update, recalls the Post and returns to the feed", async () => {
    await expect(actions.unpublishPost(POST_ID, IDLE)).rejects.toThrow("NEXT_REDIRECT:/news")

    expect(requirePermission).toHaveBeenCalledWith({ action: "post.unpublish", postId: POST_ID }, tx)
    expect(unpublishPost).toHaveBeenCalledWith(POST_ID, tx)
    expect(revalidatePath).toHaveBeenCalledWith(`/news/${POST_ID}`)
  })

  test("refuses a User without post:update", async () => {
    requirePermission.mockRejectedValue(new DeniedError())

    await expect(actions.unpublishPost(POST_ID, IDLE)).resolves.toEqual({ status: "error", error: "writeUnauthorized" })
    expect(unpublishPost).not.toHaveBeenCalled()
  })

  test("says the Post is gone when it is not published", async () => {
    unpublishPost.mockResolvedValue(false)

    await expect(actions.unpublishPost(POST_ID, IDLE)).resolves.toEqual({ status: "error", error: "postUnavailable" })
    expect(redirect).not.toHaveBeenCalled()
  })

  test("reports a failed write as retryable", async () => {
    unpublishPost.mockRejectedValue(new Error("connection refused"))

    await expect(actions.unpublishPost(POST_ID, IDLE)).resolves.toEqual({ status: "error", error: "unpublishFailed" })
    expect(loggerError).toHaveBeenCalledTimes(1)
  })
})

describe("discarding a draft", () => {
  test("throws away the acting Admin's own draft and returns to the feed", async () => {
    await expect(actions.discardDraft(POST_ID, IDLE)).rejects.toThrow("NEXT_REDIRECT:/news")

    expect(requirePermission).toHaveBeenCalledWith({ action: "post.discard", postId: POST_ID }, tx)
    expect(discardDraft).toHaveBeenCalledWith({ postId: POST_ID, authorId: "admin-1" }, tx)
    expect(revalidatePath).toHaveBeenCalledWith("/news")
  })

  test("refuses a User without post:create", async () => {
    requirePermission.mockRejectedValue(new DeniedError())

    await expect(actions.discardDraft(POST_ID, IDLE)).resolves.toEqual({ status: "error", error: "writeUnauthorized" })
    expect(discardDraft).not.toHaveBeenCalled()
  })

  test("says the draft is gone when it is not a live draft of theirs", async () => {
    discardDraft.mockResolvedValue(false)

    await expect(actions.discardDraft(POST_ID, IDLE)).resolves.toEqual({ status: "error", error: "postUnavailable" })
    expect(redirect).not.toHaveBeenCalled()
  })

  test("reports a failed write as retryable", async () => {
    discardDraft.mockRejectedValue(new Error("connection refused"))

    await expect(actions.discardDraft(POST_ID, IDLE)).resolves.toEqual({ status: "error", error: "discardFailed" })
    expect(loggerError).toHaveBeenCalledWith("news.post.discard-failed", expect.anything())
  })
})
