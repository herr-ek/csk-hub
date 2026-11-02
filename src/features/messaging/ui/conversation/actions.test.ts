import { beforeEach, describe, expect, mock, test } from "bun:test"
import { AuthorizationDeniedError } from "@/core/authz/authorization"

const markConversationRead = mock(async () => undefined)
const revalidatePath = mock()
const sendMessage = mock(async () => ({ conversationId: "conversation-1" }))

mock.module("./read", () => ({ markConversationRead }))

mock.module("../../sending", () => ({ sendMessage }))

mock.module("next/cache", () => ({ revalidatePath }))

const { markConversationReadAction, sendMessageAction } = await import("./actions")

beforeEach(() => {
  revalidatePath.mockClear()
  sendMessage.mockClear()
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
})
