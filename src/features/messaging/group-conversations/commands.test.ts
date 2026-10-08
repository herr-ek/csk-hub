import { beforeEach, describe, expect, mock, test } from "bun:test"

function rows(values: unknown[]) {
  const query = Object.assign([...values], {
    from: () => query,
    where: () => query,
    for: () => query,
    limit: async () => values
  })
  return query
}
const sets: unknown[] = []
const inserts: unknown[] = []
const selects: unknown[][] = []
const returningRows: unknown[][] = []
const tx = {
  select: mock(() => rows(selects.shift() ?? [])),
  insert: mock(() => ({
    values: (value: unknown) => {
      inserts.push(value)
      const query = { onConflictDoUpdate: () => query, returning: async () => returningRows.shift() ?? [] }
      return query
    }
  })),
  update: mock(() => ({
    set: (value: unknown) => {
      sets.push(value)
      return { where: async () => undefined }
    }
  }))
}
const db = { transaction: mock(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) }
const requireAuthenticatedUser = mock(async () => "creator")
mock.module("@/core/db", () => ({ db }))
mock.module("@/core/auth/session.server", () => ({ requireAuthenticatedUser }))
const { addGroupMembers, createGroupConversation, leaveGroupConversation, renameGroupConversation } = await import(
  "./commands"
)

beforeEach(() => {
  sets.length = 0
  inserts.length = 0
  selects.length = 0
  returningRows.length = 0
  tx.insert.mockClear()
  tx.update.mockClear()
})

describe("Group Conversation commands", () => {
  test("creates memberships and read cursors including the creator without requiring a Message", async () => {
    selects.push([{ banned: false }], [{ banned: false }])
    returningRows.push([{ id: "group-1" }])
    await expect(createGroupConversation({ name: "  Planning ", memberIds: ["member"] })).resolves.toEqual({
      conversationId: "group-1"
    })
    expect(inserts).toContainEqual({ conversationId: "group-1", name: "Planning", createdByUserId: "creator" })
    expect(inserts.filter(Array.isArray)).toEqual([
      [
        { conversationId: "group-1", userId: "creator" },
        { conversationId: "group-1", userId: "member" }
      ],
      [
        { conversationId: "group-1", userId: "creator" },
        { conversationId: "group-1", userId: "member" }
      ]
    ])
    expect(tx.insert).toHaveBeenCalledTimes(4)
  })
  test("rejects inactive recipients before creating anything", async () => {
    selects.push([{ banned: false }], [{ banned: true }])
    await expect(createGroupConversation({ name: "Planning", memberIds: ["member"] })).rejects.toMatchObject({
      kind: "recipient-inactive"
    })
    expect(inserts).toEqual([])
  })
  test("rejects additions and rename attempts from a former member", async () => {
    for (const command of [
      () => addGroupMembers({ conversationId: "group-1", memberIds: ["member"] }),
      () => renameGroupConversation({ conversationId: "group-1", name: "New name" })
    ]) {
      selects.push([{ nextMessageSequence: 7 }], [{ leftAt: new Date() }])
      await expect(command()).rejects.toMatchObject({ kind: "conversation-send-forbidden" })
    }
    expect(inserts).toEqual([])
    expect(sets).toEqual([])
  })
  test("rejects a nonmember's leave attempt", async () => {
    selects.push([{ nextMessageSequence: 7 }], [])
    await expect(leaveGroupConversation("group-1")).rejects.toMatchObject({ kind: "conversation-send-forbidden" })
    expect(sets).toEqual([])
  })
  test("leaving stores the precise last committed Message sequence without deleting history", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }])
    await leaveGroupConversation("group-1")
    expect(sets).toEqual([{ leftAt: expect.any(Date), historyVisibleThroughSequence: 6 }])
    expect(inserts).toEqual([])
  })
  test("rejoining immediately marks retained history read", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }], [{ banned: false }])
    returningRows.push([{ userId: "member" }])
    await addGroupMembers({ conversationId: "group-1", memberIds: ["member"] })
    expect(inserts).toContainEqual({ conversationId: "group-1", userId: "member", lastReadSequence: 6 })
  })
  test("adding an already active member preserves their unread position", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }], [{ banned: false }])
    returningRows.push([])
    await addGroupMembers({ conversationId: "group-1", memberIds: ["member"] })
    expect(inserts).toHaveLength(1)
  })
})
