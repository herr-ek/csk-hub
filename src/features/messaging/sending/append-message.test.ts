import { expect, mock, test } from "bun:test"

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

test("authorizes Group Conversation sending after locking and before accepting an idempotent retry", async () => {
  const tx = {
    execute: mock(async () => undefined),
    select: mock(() => selectRows([])),
    insert: mock(),
    update: mock()
  }
  const authorize = mock(async () => {
    throw Object.assign(new Error("Left"), { kind: "conversation-send-forbidden" })
  })
  await expect(
    appendMessage(
      tx as never,
      {
        conversationId: "group-1",
        authorUserId: "member-1",
        text: "Hello",
        idempotencyKey: "request-1"
      },
      authorize
    )
  ).rejects.toMatchObject({ kind: "conversation-send-forbidden" })
  expect(tx.execute).toHaveBeenCalledTimes(1)
  expect(tx.select).toHaveBeenCalledTimes(1)
  expect(authorize).toHaveBeenCalledTimes(1)
  expect(tx.insert).not.toHaveBeenCalled()
})
