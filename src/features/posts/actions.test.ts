import { beforeEach, describe, expect, mock, test } from "bun:test"

const requirePostPublisher = mock(async () => ({ memberId: "admin-1" }))
const revalidatePath = mock(() => undefined)
const redirect = mock((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`)
})
const returning = mock(async () => [{ id: "11111111-1111-4111-8111-111111111111" }])
const values = mock(() => ({ returning }))
const insert = mock(() => ({ values }))
const loggerError = mock(() => undefined)

class DeniedError extends Error {
  readonly code = "POST_PUBLISHING_DENIED"
}

mock.module("./permissions.server", () => ({
  requirePostPublisher,
  POST_PUBLISHING_DENIED: "POST_PUBLISHING_DENIED",
  PostPublishingDeniedError: DeniedError
}))
mock.module("@/core/db", () => ({ db: { insert } }))
mock.module("@/core/logging", () => ({ logger: { error: loggerError } }))
mock.module("next/cache", () => ({ revalidatePath }))
mock.module("next/navigation", () => ({ redirect }))

import { publishPost } from "./actions"

const TITLE = "Höstkonsert"
const BODY = "Vi sjunger i Vasakyrkan."

function postFormData(title = TITLE, body = BODY) {
  const data = new FormData()
  data.set("title", title)
  data.set("body", body)
  return data
}

beforeEach(() => {
  requirePostPublisher.mockClear()
  requirePostPublisher.mockResolvedValue({ memberId: "admin-1" })
  revalidatePath.mockClear()
  redirect.mockClear()
  insert.mockClear()
  values.mockClear()
  returning.mockClear()
  returning.mockResolvedValue([{ id: "11111111-1111-4111-8111-111111111111" }])
  loggerError.mockClear()
})

describe("publishing a Post", () => {
  test("stores the Post against its author and sends the Admin to its permalink", async () => {
    await expect(publishPost({ status: "idle" }, postFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/news/11111111-1111-4111-8111-111111111111"
    )

    expect(requirePostPublisher).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith({
      title: TITLE,
      body: BODY,
      authorId: "admin-1",
      publishedAt: expect.any(Date)
    })
    expect(revalidatePath).toHaveBeenCalledWith("/news")
  })

  test("refuses a Member who may not publish, without writing anything", async () => {
    requirePostPublisher.mockRejectedValue(new DeniedError())

    await expect(publishPost({ status: "idle" }, postFormData())).resolves.toEqual({
      status: "error",
      error: "Only admins can publish posts.",
      draft: { title: TITLE, body: BODY }
    })

    expect(insert).not.toHaveBeenCalled()
  })

  test("treats a failed authorization lookup as retryable rather than a refusal", async () => {
    requirePostPublisher.mockRejectedValue(new Error("connection refused"))

    await expect(publishPost({ status: "idle" }, postFormData())).resolves.toEqual({
      status: "error",
      error: "Unable to publish that post right now. Please try again.",
      draft: { title: TITLE, body: BODY }
    })

    expect(loggerError).toHaveBeenCalledTimes(1)
    expect(insert).not.toHaveBeenCalled()
  })

  test("requires a title and a body before authorizing anything", async () => {
    await expect(publishPost({ status: "idle" }, postFormData("   ", BODY))).resolves.toEqual({
      status: "error",
      error: "Title is required.",
      draft: { title: "   ", body: BODY }
    })
    await expect(publishPost({ status: "idle" }, postFormData(TITLE, "  "))).resolves.toEqual({
      status: "error",
      error: "Body is required.",
      draft: { title: TITLE, body: "  " }
    })

    expect(requirePostPublisher).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  test("hands the Admin their post back when the write fails", async () => {
    returning.mockRejectedValue(new Error("connection refused"))

    await expect(publishPost({ status: "idle" }, postFormData())).resolves.toEqual({
      status: "error",
      error: "Unable to publish that post right now. Please try again.",
      draft: { title: TITLE, body: BODY }
    })

    expect(redirect).not.toHaveBeenCalled()
  })
})
