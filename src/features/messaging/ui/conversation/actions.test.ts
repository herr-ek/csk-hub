import { beforeEach, describe, expect, mock, test } from "bun:test"

const markConversationRead = mock(async () => undefined)
const getSession = mock(async () => null as null | { session: { impersonatedBy: string | null } })
const revalidatePath = mock()
const sendMessage = mock(async () => ({ conversationId: "conversation-1" }))

mock.module("./read", () => ({ markConversationRead }))
mock.module("@/core/auth/session.server", () => ({
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  getRequestSession: getSession,
  requireAuthenticatedUser: mock(async () => "sender")
}))
mock.module("../../sending", () => ({ sendMessage }))

mock.module("next/cache", () => ({ revalidatePath }))

const { markConversationReadAction, sendMessageAction } = await import("./actions")

beforeEach(() => {
  getSession.mockClear()
  getSession.mockResolvedValue(null)
  revalidatePath.mockClear()
  sendMessage.mockClear()
  markConversationRead.mockClear()
})

describe("message Server Actions", () => {
  test("refuse to send while the current session is impersonating a member", async () => {
    getSession.mockResolvedValue({ session: { impersonatedBy: "admin-1" } })
    const existingConversation = new FormData()
    existingConversation.set("conversationId", "conversation-1")
    existingConversation.set("idempotencyKey", "request-1")
    existingConversation.set("text", "Existing conversation")
    await expect(sendMessageAction({ status: "idle" }, existingConversation)).resolves.toEqual({
      status: "error",
      error: "impersonation-unavailable",
      text: "Existing conversation"
    })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("sends a message in an existing conversation for a non-impersonated session", async () => {
    getSession.mockResolvedValue({ session: { impersonatedBy: null } })
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
    sendMessage.mockRejectedValueOnce(Object.assign(new Error(), { code: "AUTHENTICATION_REQUIRED" }))

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
    getSession.mockRejectedValueOnce(new Error("session lookup failed"))

    await expect(sendMessageAction({ status: "idle" }, formData)).resolves.toEqual({
      status: "error",
      error: "unexpected",
      text: "Try later"
    })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("advances a viewer's cursor only when the loaded Conversation explicitly marks its newest sequence", async () => {
    getSession.mockResolvedValue({ session: { impersonatedBy: null } })
    await markConversationReadAction("conversation-1", 4, "verified-token")

    expect(markConversationRead).toHaveBeenCalledWith("conversation-1", 4, "verified-token")
  })

  test("does not advance a User's read cursor during impersonation or without a session", async () => {
    await markConversationReadAction("conversation-1", 4, "verified-token")
    getSession.mockResolvedValue({ session: { impersonatedBy: "admin-1" } })
    await markConversationReadAction("conversation-1", 4, "verified-token")
    expect(markConversationRead).not.toHaveBeenCalled()
  })
})
