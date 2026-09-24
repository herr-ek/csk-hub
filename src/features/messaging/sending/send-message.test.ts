import { describe, expect, mock, test } from "bun:test"

class MessagingAccessError extends Error {
  constructor(readonly kind: string) {
    super(kind)
  }
}

const requireAuthenticatedUser = mock(async () => "sender")
const requireActiveDirectRecipient = mock()
const resolveActiveDirectCounterpart = mock()
const appendMessage = mock()
const db = { select: mock(), transaction: mock() }

mock.module("@/core/db", () => ({ db }))
mock.module("@/core/auth/session.server", () => ({
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  requireAuthenticatedUser
}))
mock.module("../model/messaging-error", () => ({ MessagingAccessError }))
mock.module("./direct-recipient", () => ({ requireActiveDirectRecipient, resolveActiveDirectCounterpart }))
mock.module("./append-message", () => ({ appendMessage }))

const { sendMessage } = await import("./send-message")

describe("sendMessage", () => {
  test("rejects a direct conversation whose counterpart is inactive", async () => {
    resolveActiveDirectCounterpart.mockRejectedValueOnce(new MessagingAccessError("conversation-recipient-inactive"))
    const tx = {}
    db.transaction.mockImplementationOnce((callback: (transaction: typeof tx) => unknown) => callback(tx))

    await expect(
      sendMessage({ conversationId: "conversation-1", text: "Hello", idempotencyKey: "request-1" })
    ).rejects.toMatchObject({ kind: "conversation-recipient-inactive" })

    expect(appendMessage).not.toHaveBeenCalled()
  })
})
