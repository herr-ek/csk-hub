import { describe, expect, mock, test } from "bun:test"

const currentMessagingActor = mock(async () => ({ userId: "member-1" }))
const db = { select: mock() }

mock.module("server-only", () => ({}))
mock.module("@/core/db", () => ({ db }))
mock.module("./messaging-access", () => ({ currentMessagingActor }))

const { listDirectConversations } = await import("./inbox-query")

describe("listDirectConversations", () => {
  test("decodes the latest Message timestamp before it reaches the inbox screen", async () => {
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: async () => []
    }
    db.select.mockReturnValueOnce(query)

    await listDirectConversations()

    const selection = db.select.mock.calls[0]?.[0] as {
      latestMessageSentAt: { decoder?: { mapFromDriverValue(value: string): unknown } }
    }
    const sentAt = selection.latestMessageSentAt.decoder?.mapFromDriverValue("2026-09-02T09:00:00.000Z")

    expect(sentAt).toBeInstanceOf(Date)
    expect((sentAt as Date).toISOString()).toBe("2026-09-02T09:00:00.000Z")
  })
})
