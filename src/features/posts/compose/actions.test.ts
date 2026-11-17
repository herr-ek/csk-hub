import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { PostWriteResult } from "./commands"

const POST_ID = "11111111-1111-4111-8111-111111111111"
const GROUP_ID = "22222222-2222-4222-8222-222222222222"
const scheduleActivityDispatch = mock()
const revalidatePath = mock()
const redirect = mock((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`)
})
const success: PostWriteResult = { status: "success", postId: POST_ID, revision: 8 }
const createPostCommand = mock(async (): Promise<PostWriteResult> => success)
const saveDraftCommand = mock(async (): Promise<PostWriteResult> => success)
const editPublishedPostCommand = mock(async (): Promise<PostWriteResult> => success)
const unpublishPostCommand = mock(
  async (): Promise<PostWriteResult<{ unpublishedTo: "group" }>> => ({
    ...success,
    status: "success",
    postId: POST_ID,
    unpublishedTo: "group"
  })
)
const discardDraftCommand = mock(async (): Promise<PostWriteResult> => success)
mock.module("./commands", () => ({
  createPostCommand,
  saveDraftCommand,
  editPublishedPostCommand,
  unpublishPostCommand,
  discardDraftCommand
}))
mock.module("@/features/messaging/activity", () => ({ scheduleActivityDispatch }))
mock.module("next/cache", () => ({ revalidatePath }))
const navigation = await import("next/navigation")
mock.module("next/navigation", () => ({ ...navigation, redirect }))
const actions = await import("./actions")
const IDLE = { status: "idle" } as const
const BODY = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Rehearsal" }] }]
})
function form(intent?: string) {
  const data = new FormData()
  data.set("title", "Notice")
  data.set("body", BODY)
  data.set("audience", "all")
  data.set("revision", "7")
  if (intent) data.set("intent", intent)
  return data
}

beforeEach(() => {
  for (const fn of [createPostCommand, saveDraftCommand, editPublishedPostCommand, discardDraftCommand]) {
    fn.mockReset()
    fn.mockResolvedValue(success)
  }
  for (const fn of [revalidatePath, redirect, scheduleActivityDispatch, unpublishPostCommand]) fn.mockClear()
})

describe("Post form transport", () => {
  test("only explicit Publish publishes, with validated publisher and audience values", async () => {
    const data = form("publish")
    data.set("publisherGroupId", GROUP_ID)
    data.set("audience", "groups")
    data.set(
      "targets",
      JSON.stringify([
        { groupId: GROUP_ID, voiceFamily: null },
        { groupId: GROUP_ID, voiceFamily: null }
      ])
    )
    await expect(actions.createPost(IDLE, data)).rejects.toThrow(`NEXT_REDIRECT:/news/${POST_ID}`)
    expect(createPostCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        publisherGroupId: GROUP_ID,
        audienceAll: false,
        targets: [{ groupId: GROUP_ID, voiceFamily: null }]
      }),
      true
    )
    await expect(actions.createPost(IDLE, form())).rejects.toThrow(`NEXT_REDIRECT:/news/${POST_ID}/edit`)
    expect(createPostCommand).toHaveBeenLastCalledWith(expect.anything(), false)
  })

  test("invalid content and forged IDs never reach a command", async () => {
    for (const [field, value] of [
      ["title", " "],
      ["body", "invalid"],
      ["publisherGroupId", "not-a-uuid"],
      ["targets", "not-json"],
      ["revision", "-1"]
    ]) {
      const data = form("publish")
      data.set(field, value)
      expect(await actions.createPost(IDLE, data)).toMatchObject({ status: "error", error: "formInvalid" })
    }
    expect(createPostCommand).not.toHaveBeenCalled()
  })

  test("transports mixed Group/Voice targets and rejects empty rules and division/capability filters", async () => {
    const targets = [
      { groupId: GROUP_ID, voiceFamily: "S" },
      { groupId: null, voiceFamily: "B" }
    ]
    const data = form("publish")
    data.set("audience", "targets")
    data.set("targets", JSON.stringify(targets))
    await expect(actions.createPost(IDLE, data)).rejects.toThrow("NEXT_REDIRECT")
    expect(createPostCommand).toHaveBeenCalledWith(expect.objectContaining({ targets }), true)
    createPostCommand.mockClear()
    for (const invalid of [
      [{ groupId: null, voiceFamily: null }],
      [{ groupId: null, voiceFamily: "B2" }],
      [{ groupId: "forged", voiceFamily: "B" }],
      [{ groupId: null, voiceFamily: "unknown" }],
      Array.from({ length: 101 }, () => ({ groupId: null, voiceFamily: "B" }))
    ]) {
      data.set("targets", JSON.stringify(invalid))
      expect(await actions.createPost(IDLE, data)).toMatchObject({ status: "error", error: "formInvalid" })
    }
    expect(createPostCommand).not.toHaveBeenCalled()
    const incomplete = [...targets, { groupId: null, voiceFamily: null }]
    data.set("targets", JSON.stringify(incomplete))
    expect(await actions.createPost(IDLE, data)).toMatchObject({
      status: "error",
      error: "formInvalid",
      values: { targets: incomplete }
    })
  })

  test("an incomplete audience row returns a specific error beside that row", async () => {
    const data = form("publish")
    data.set("audience", "targets")
    data.set(
      "targets",
      JSON.stringify([
        { groupId: GROUP_ID, voiceFamily: "B" },
        { groupId: null, voiceFamily: null }
      ])
    )
    expect(await actions.createPost(IDLE, data)).toMatchObject({
      status: "error",
      error: "formInvalid",
      targetErrors: [1]
    })
    expect(createPostCommand).not.toHaveBeenCalled()
  })

  test("sanitizes unsupported document markup before writing", async () => {
    const data = form()
    data.set(
      "body",
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }
            ]
          }
        ]
      })
    )
    await expect(actions.createPost(IDLE, data)).rejects.toThrow("NEXT_REDIRECT")
    expect(createPostCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "click" }] }] }
      }),
      false
    )
  })

  test("saving a draft acknowledges the new revision without navigating away", async () => {
    const result = await actions.saveDraft(POST_ID, IDLE, form("draft"))
    expect(result).toMatchObject({ status: "saved", revision: 8, values: { title: "Notice", body: BODY } })
    expect(redirect).not.toHaveBeenCalled()
  })

  test("forwards the loaded revision on saves and publications", async () => {
    await expect(actions.saveDraft(POST_ID, IDLE, form("publish"))).rejects.toThrow("NEXT_REDIRECT")
    expect(saveDraftCommand).toHaveBeenCalledWith(POST_ID, expect.anything(), true, 7)
    await expect(actions.editPublishedPost(POST_ID, IDLE, form())).rejects.toThrow("NEXT_REDIRECT")
    expect(editPublishedPostCommand).toHaveBeenCalledWith(POST_ID, expect.anything(), 7)
  })

  test.each([
    ["unauthorized", "writeUnauthorized"],
    ["failed", "saveFailed"],
    ["unavailable", "postUnavailable"],
    ["conflict", "editConflict"]
  ] as const)("%s preserves the entire submission", async (status, error) => {
    editPublishedPostCommand.mockResolvedValue({ status })
    const data = form()
    data.set("publisherGroupId", GROUP_ID)
    expect(await actions.editPublishedPost(POST_ID, IDLE, data)).toEqual({
      status: "error",
      error,
      values: {
        title: "Notice",
        body: BODY,
        publisherGroupId: GROUP_ID,
        audienceAll: true,
        targets: [],
        revision: "7"
      }
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  test("recall and discard forward revisions and describe shared recall", async () => {
    await expect(actions.unpublishPost(POST_ID, IDLE, form())).rejects.toThrow("NEXT_REDIRECT:/news?unpublished=group")
    expect(unpublishPostCommand).toHaveBeenCalledWith(POST_ID, 7)
    await expect(actions.discardDraft(POST_ID, IDLE, form())).rejects.toThrow("NEXT_REDIRECT:/news")
    expect(discardDraftCommand).toHaveBeenCalledWith(POST_ID, 7)
  })
})
