import { beforeEach, describe, expect, mock, test } from "bun:test"
import { AuthorizationDeniedError } from "@/core/authz/authorization"

const markConversationRead = mock(async () => true)
const revalidatePath = mock()
const refresh = mock()
const sendMessage = mock(async () => ({ conversationId: "conversation-1", created: true }))
const scheduleActivityDispatch = mock()
mock.module("@/features/messaging/activity", () => ({ scheduleActivityDispatch }))

mock.module("./read", () => ({ markConversationRead }))

mock.module("../../sending", () => ({ sendMessage }))

mock.module("next/cache", () => ({ refresh, revalidatePath }))

const { markConversationReadAction, sendMessageAction } = await import("./actions")

beforeEach(() => {
  revalidatePath.mockClear()
  refresh.mockClear()
  sendMessage.mockReset().mockResolvedValue({ conversationId: "conversation-1", created: true })
  scheduleActivityDispatch.mockClear()
  markConversationRead.mockReset()
  markConversationRead.mockResolvedValue(true)
})

describe("message Server Actions", () => {
  test("sends a message in an existing conversation", async () => {
    const existingConversation = new FormData()
    existingConversation.set("conversationId", "conversation-1")
    existingConversation.set("idempotencyKey", "request-1")
    existingConversation.set("text", "Existing conversation")
    await expect(sendMessageAction({ status: "idle" }, existingConversation)).resolves.toEqual({
      status: "success",
      conversationId: "conversation-1"
    })
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      idempotencyKey: "request-1",
      text: "Existing conversation"
    })
  })

  test("leave missing-session handling with the authenticated send command", async () => {
    const formData = new FormData()
    formData.set("conversationId", "conversation-1")
    formData.set("idempotencyKey", "request-1")
    formData.set("text", "Sign in first")
    sendMessage.mockRejectedValueOnce(new AuthorizationDeniedError({ action: "app.access" }, null))

    await expect(sendMessageAction({ status: "idle" }, formData)).resolves.toEqual({
      status: "error",
      error: "sign-in-required",
      text: "Sign in first"
    })

    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  test("fails closed when the current session cannot be checked", async () => {
    const formData = new FormData()
    formData.set("conversationId", "conversation-1")
    formData.set("idempotencyKey", "request-1")
    formData.set("text", "Try later")
    sendMessage.mockRejectedValueOnce(new Error("session lookup failed"))

    await expect(sendMessageAction({ status: "idle" }, formData)).resolves.toEqual({
      status: "error",
      error: "unexpected",
      text: "Try later"
    })

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("advances a viewer's cursor only when the loaded Conversation explicitly marks its newest sequence", async () => {
    await markConversationReadAction("conversation-1", 4, "verified-token")

    expect(markConversationRead).toHaveBeenCalledWith("conversation-1", 4, "verified-token")
  })

  test("refreshes the unread badge only when the cursor moved", async () => {
    await markConversationReadAction("conversation-1", 4, "verified-token")
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/(app)/messages", "page")

    markConversationRead.mockResolvedValueOnce(false)
    await markConversationReadAction("conversation-1", 4, "verified-token")
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(scheduleActivityDispatch).toHaveBeenCalledTimes(1)
  })

  test("an exact send retry schedules no new delivery loop", async () => {
    sendMessage.mockResolvedValueOnce({ conversationId: "conversation-1", created: false })
    const data = new FormData()
    data.set("conversationId", "conversation-1")
    data.set("text", "Retry")
    await sendMessageAction({ status: "idle" }, data)
    expect(scheduleActivityDispatch).not.toHaveBeenCalled()
  })

  test("a denied read-marker command schedules no activity or refresh", async () => {
    markConversationRead.mockRejectedValueOnce(new AuthorizationDeniedError({ action: "app.access" }, null))
    await expect(markConversationReadAction("conversation-1", 4, "verified-token")).rejects.toBeInstanceOf(
      AuthorizationDeniedError
    )
    expect(scheduleActivityDispatch).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
