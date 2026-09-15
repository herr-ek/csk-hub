import { describe, expect, mock, test } from "bun:test"

function selectRows(rows: unknown[]) {
  const query = Object.assign([...rows], {
    from: () => query,
    where: () => query,
    limit: async () => rows
  })
  return query
}

const { appendMessage } = await import("./message-write")

describe("appendMessage", () => {
  test("returns an idempotent retry found after taking the conversation lock without allocating a sequence", async () => {
    const insert = mock()
    const tx = {
      execute: mock(async () => undefined),
      select: mock(() => selectRows([{ id: "message-1", conversationId: "conversation-1", sequence: 4 }])),
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
})
