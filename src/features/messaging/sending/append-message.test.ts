import { describe, expect, mock, test } from "bun:test"

function selectRows(rows: unknown[]) {
  const query = Object.assign([...rows], {
    from: () => query,
    where: () => query,
    for: () => query,
    limit: async () => rows
  })
  return query
}

const { appendMessage } = await import("./append-message")

describe("appendMessage", () => {
  test("rejects an idempotency key reused for different persisted message content", async () => {
    const tx = {
      execute: mock(async () => undefined),
      select: mock()
    }
    tx.select
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(
        selectRows([{ id: "message-1", conversationId: "conversation-1", sequence: 4, text: "Hello" }])
      )

    await expect(
      appendMessage(tx as never, {
        conversationId: "conversation-1",
        authorUserId: "member-1",
        text: "Different",
        idempotencyKey: "request-1"
      })
    ).rejects.toMatchObject({ kind: "idempotency-key-reused" })
  })

  test("rejects an idempotency key reused for a different direct conversation", async () => {
    const tx = {
      execute: mock(async () => undefined),
      select: mock()
    }
    tx.select
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(
        selectRows([{ id: "message-1", conversationId: "conversation-1", sequence: 4, text: "Hello" }])
      )

    await expect(
      appendMessage(tx as never, {
        conversationId: "conversation-2",
        authorUserId: "member-1",
        text: "Hello",
        idempotencyKey: "request-1"
      })
    ).rejects.toMatchObject({ kind: "idempotency-key-reused" })
  })

  test("serializes a sender's idempotency key and returns a retry without allocating a sequence", async () => {
    const insert = mock()
    const tx = {
      execute: mock(async () => undefined),
      select: mock(() =>
        selectRows([{ id: "message-1", conversationId: "conversation-1", sequence: 4, text: "Hello" }])
      ),
      insert,
      update: mock()
    }

    await expect(
      appendMessage(tx as never, {
        conversationId: "conversation-1",
        authorUserId: "member-1",
        text: "Hello",
        idempotencyKey: "request-1"
      })
    ).resolves.toEqual({ id: "message-1", conversationId: "conversation-1", sequence: 4, created: false })

    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(insert).not.toHaveBeenCalled()
    expect(tx.update).not.toHaveBeenCalled()
  })

  test("allocates the next sequence from the locked conversation rather than scanning messages", async () => {
    const insertValues = mock()
    const insert = mock(() => ({
      values: insertValues.mockReturnValue({
        returning: async () => [{ id: "message-2", conversationId: "conversation-1", sequence: 4 }]
      })
    }))
    const allocateSequence = {
      set: mock(() => ({
        where: () => ({ returning: async () => [{ sequence: 4 }] })
      }))
    }
    const updateReadState = { set: () => ({ where: async () => undefined }) }
    const tx = {
      execute: mock(async () => undefined),
      select: mock(() => selectRows([])),
      insert,
      update: mock(() => (tx.update.mock.calls.length === 1 ? allocateSequence : updateReadState))
    }

    await expect(
      appendMessage(tx as never, {
        conversationId: "conversation-1",
        authorUserId: "member-1",
        text: "Hello",
        idempotencyKey: "request-2"
      })
    ).resolves.toEqual({ id: "message-2", conversationId: "conversation-1", sequence: 4, created: true })

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        authorUserId: "member-1",
        idempotencyKey: "request-2",
        sequence: 4
      })
    )
    expect(tx.select).toHaveBeenCalledTimes(2)
  })
})
