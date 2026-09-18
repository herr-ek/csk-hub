import { describe, expect, mock, test } from "bun:test"

class MessagingAccessError extends Error {
  constructor(readonly kind: string) {
    super(kind)
  }
}

const requireAuthenticatedUser = mock(async () => "sender")
const resolveActiveDirectCounterpart = mock()
const writeMessage = mock()
const db = { select: mock(), transaction: mock() }

mock.module("@/core/db", () => ({ db }))
mock.module("@/core/auth/session.server", () => ({ requireAuthenticatedUser }))
mock.module("../errors", () => ({ MessagingAccessError }))
mock.module("./participant", () => ({ resolveActiveDirectCounterpart }))
mock.module("./write", () => ({ writeMessage }))

const { sendMessage } = await import("./send")

describe("sendMessage", () => {
  test("rejects a direct conversation whose counterpart is inactive", async () => {
    resolveActiveDirectCounterpart.mockRejectedValueOnce(new MessagingAccessError("conversation-recipient-inactive"))
    const tx = {}
    db.transaction.mockImplementationOnce((callback: (transaction: typeof tx) => unknown) => callback(tx))

    await expect(
      sendMessage({ conversationId: "conversation-1", text: "Hello", idempotencyKey: "request-1" })
    ).rejects.toMatchObject({ kind: "conversation-recipient-inactive" })

    expect(writeMessage).not.toHaveBeenCalled()
  })
})
