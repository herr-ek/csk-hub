import { describe, expect, mock, test } from "bun:test"

class MessagingAccessError extends Error {
  constructor(readonly kind: string) {
    super(kind)
  }
}

function selectRows(rows: unknown[]) {
  const query = Object.assign([...rows], {
    from: () => query,
    where: () => query,
    limit: async () => rows
  })
  return query
}

const currentMessagingUserId = mock(async () => "sender")
const appendMessage = mock()
const db = { select: mock(), transaction: mock() }

mock.module("@/core/db", () => ({ db }))
mock.module("../access", () => ({ currentMessagingUserId, MessagingAccessError }))
mock.module("../message-write", () => ({ appendMessage, findMessageRetry: mock(async () => undefined) }))

const { sendMessage } = await import("./send-message")

describe("sendMessage", () => {
  test("rejects a direct conversation whose counterpart no longer has an active membership", async () => {
    const tx = {
      select: mock()
        .mockReturnValueOnce(selectRows([{ conversationId: "conversation-1" }]))
        .mockReturnValueOnce(selectRows([{ firstMemberId: "sender", secondMemberId: "former-member" }]))
        .mockReturnValueOnce(selectRows([]))
    }
    db.transaction.mockImplementationOnce((callback: (transaction: typeof tx) => unknown) => callback(tx))

    await expect(
      sendMessage({ conversationId: "conversation-1", text: "Hello", idempotencyKey: "request-1" })
    ).rejects.toMatchObject({ kind: "conversation-recipient-inactive" })

    expect(appendMessage).not.toHaveBeenCalled()
  })
})
