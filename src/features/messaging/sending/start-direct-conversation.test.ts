import { describe, expect, mock, test } from "bun:test"
import { AuthorizationDeniedError } from "@/core/authz/authorization"

const requirePermission = mock(async () => ({ userId: "sender", isAdmin: false }))
const execute = mock(async () => undefined)
const updateSet = mock(() => ({ where: mock(async () => undefined) }))

function selectRows(rows: unknown[]) {
  const query = Object.assign([...rows], {
    from: () => query,
    where: () => query,
    for: () => query,
    limit: async () => rows
  })
  return query
}

mock.module("@/core/authz", () => ({ requirePermission, AuthorizationDeniedError }))
mock.module("server-only", () => ({}))

const db = {
  select: mock(),
  transaction: mock()
}
mock.module("@/core/db", () => ({ db }))

const { startDirectConversation } = await import("./start-direct-conversation")

describe("startDirectConversation", () => {
  test("advances the sender's read cursor in the Message transaction", async () => {
    const transactionSelect = mock()
    transactionSelect
      .mockReturnValueOnce(selectRows([{ id: "recipient", banned: false }]))
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(selectRows([]))
    const transactionInsert = mock()
    transactionInsert
      .mockReturnValueOnce({ values: () => ({ returning: async () => [{ id: "conversation-1" }] }) })
      .mockReturnValueOnce({ values: async () => undefined })
      .mockReturnValueOnce({ values: async () => undefined })
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "message-1", conversationId: "conversation-1", sequence: 1 }] })
      })
    const tx = {
      select: transactionSelect,
      insert: transactionInsert,
      execute,
      update: mock(() =>
        tx.update.mock.calls.length === 1
          ? { set: () => ({ where: () => ({ returning: async () => [{ sequence: 1 }] }) }) }
          : { set: updateSet }
      )
    }
    db.transaction.mockImplementationOnce((callback: (transaction: typeof tx) => unknown) => callback(tx))

    await expect(
      startDirectConversation({ recipientId: "recipient", text: "Hello", idempotencyKey: "request-1" })
    ).resolves.toEqual({ id: "message-1", conversationId: "conversation-1", sequence: 1, created: true })

    expect(updateSet).toHaveBeenCalledWith({ lastReadSequence: 1 })
  })

  test("rejects an inactive recipient even when a client submits its ID directly", async () => {
    execute.mockClear()
    const transactionSelect = mock()
    transactionSelect.mockReturnValueOnce(selectRows([{ id: "recipient", banned: true }]))
    const tx = { execute, select: transactionSelect }
    db.transaction.mockImplementationOnce((callback: (transaction: typeof tx) => unknown) => callback(tx))

    await expect(
      startDirectConversation({ recipientId: "recipient", text: "Hello", idempotencyKey: "request-2" })
    ).rejects.toMatchObject({ kind: "recipient-inactive" })

    expect(execute).not.toHaveBeenCalled()
  })
})
