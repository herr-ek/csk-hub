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

const { writeMessage, findMessageByIdempotencyKey } = await import("./write")

describe("writeMessage", () => {
  test("rejects an idempotency key reused for different persisted message content", async () => {
    const tx = {
      select: mock(() =>
        selectRows([{ id: "message-1", conversationId: "conversation-1", sequence: 4, text: "Hello" }])
      )
    }

    await expect(
      findMessageByIdempotencyKey(tx as never, "member-1", "request-1", {
        conversationId: "conversation-1",
        text: "Different"
      })
    ).rejects.toMatchObject({ kind: "idempotency-key-reused" })
  })

  test("rejects an idempotency key reused for a different direct conversation", async () => {
    const tx = {
      select: mock(() =>
        selectRows([{ id: "message-1", conversationId: "conversation-1", sequence: 4, text: "Hello" }])
      )
    }

    await expect(
      findMessageByIdempotencyKey(tx as never, "member-1", "request-1", {
        conversationId: "conversation-2",
        text: "Hello"
      })
    ).rejects.toMatchObject({ kind: "idempotency-key-reused" })
  })

  test("returns an idempotent retry found after taking the conversation lock without allocating a sequence", async () => {
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
      writeMessage(tx as never, {
        conversationId: "conversation-1",
        authorUserId: "member-1",
        text: "Hello",
        idempotencyKey: "request-1"
      })
    ).resolves.toEqual({ id: "message-1", conversationId: "conversation-1", sequence: 4, created: false })

    expect(tx.execute).not.toHaveBeenCalled()
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
      writeMessage(tx as never, {
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
