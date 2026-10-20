import { beforeEach, describe, expect, mock, test } from "bun:test"
import { MAX_GROUP_MEMBER_IDS_PER_REQUEST } from "../model/group-conversation"

function rows(values: unknown[]) {
  const query = Object.assign([...values], {
    from: () => query,
    where: () => query,
    orderBy: () => query,
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
  execute: mock(async () => undefined),
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
const requireMessagingUserId = mock(async () => "creator")
mock.module("@/core/db", () => ({ db }))
mock.module("@/core/authz", () => ({ requireMessagingUserId }))
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
  tx.execute.mockClear()
  tx.select.mockClear()
})

describe("Group Conversation commands", () => {
  test("adding multiple members uses a bounded number of database calls", async () => {
    const members = Array.from({ length: MAX_GROUP_MEMBER_IDS_PER_REQUEST }, (_, index) => ({
      id: `member-${index}`,
      banned: false
    }))
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }], members)
    returningRows.push(members.map(({ id }) => ({ userId: id })))
    await addGroupMembers({ conversationId: "group-1", memberIds: members.map(({ id }) => id).reverse() })
    expect(tx.select).toHaveBeenCalledTimes(3)
    expect(tx.insert).toHaveBeenCalledTimes(2)
  })
  test("creates memberships and read cursors including the creator without requiring a Message", async () => {
    selects.push(
      [],
      [
        { id: "creator", banned: false },
        { id: "member", banned: false }
      ]
    )
    returningRows.push([{ id: "group-1" }])
    await expect(
      createGroupConversation({ name: "  Planning ", memberIds: ["member"], idempotencyKey: "intent-1" })
    ).resolves.toEqual({
      conversationId: "group-1"
    })
    expect(inserts).toContainEqual({
      conversationId: "group-1",
      name: "Planning",
      createdByUserId: "creator",
      creationIdempotencyKey: "intent-1",
      creationPayloadHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
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
    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(tx.select).toHaveBeenCalledTimes(2)
  })
  test("rejects inactive recipients before creating anything", async () => {
    selects.push(
      [],
      [
        { id: "creator", banned: false },
        { id: "member", banned: true }
      ]
    )
    await expect(
      createGroupConversation({ name: "Planning", memberIds: ["member"], idempotencyKey: "intent-1" })
    ).rejects.toMatchObject({
      kind: "recipient-inactive"
    })
    expect(inserts).toEqual([])
  })
  test("rejects a missing or blank creation key before opening a transaction", async () => {
    db.transaction.mockClear()
    for (const idempotencyKey of ["", "  "]) {
      await expect(
        createGroupConversation({ name: "Planning", memberIds: ["member"], idempotencyKey })
      ).rejects.toMatchObject({
        kind: "idempotency-key-required"
      })
    }
    expect(db.transaction).not.toHaveBeenCalled()
  })
  test("rejects oversized creation and addition requests before opening a transaction", async () => {
    db.transaction.mockClear()
    const memberIds = Array.from({ length: 1_000 }, (_, index) => `member-${index}`)
    for (const command of [
      () => createGroupConversation({ name: "Planning", memberIds, idempotencyKey: "intent-1" }),
      () => addGroupMembers({ conversationId: "group-1", memberIds })
    ]) {
      await expect(command()).rejects.toMatchObject({ kind: "group-members-too-many" })
    }
    expect(db.transaction).not.toHaveBeenCalled()
  })
  test("rejects a missing user in a batch before changing memberships", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }], [{ id: "first", banned: false }])
    await expect(addGroupMembers({ conversationId: "group-1", memberIds: ["first", "missing"] })).rejects.toMatchObject(
      { kind: "recipient-required" }
    )
    expect(inserts).toEqual([])
  })
  test("rejects an inactive user in a batch before changing memberships", async () => {
    selects.push(
      [{ nextMessageSequence: 7 }],
      [{ leftAt: null }],
      [
        { id: "first", banned: false },
        { id: "second", banned: true }
      ]
    )
    await expect(addGroupMembers({ conversationId: "group-1", memberIds: ["first", "second"] })).rejects.toMatchObject({
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
      await expect(command()).rejects.toMatchObject({ kind: "group-management-forbidden" })
    }
    expect(inserts).toEqual([])
    expect(sets).toEqual([])
  })
  test("rejects a nonmember's leave attempt", async () => {
    selects.push([{ nextMessageSequence: 7 }], [])
    await expect(leaveGroupConversation("group-1")).rejects.toMatchObject({ kind: "group-management-forbidden" })
    expect(sets).toEqual([])
  })
  test("leaving stores the precise last committed Message sequence without deleting history", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }])
    await leaveGroupConversation("group-1")
    expect(sets).toEqual([{ leftAt: expect.any(Date), historyVisibleThroughSequence: 6 }])
    expect(inserts).toEqual([])
  })
  test("rejoining immediately marks retained history read", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }], [{ id: "member", banned: false }])
    returningRows.push([{ userId: "member" }])
    await addGroupMembers({ conversationId: "group-1", memberIds: ["member"] })
    expect(inserts).toContainEqual([{ conversationId: "group-1", userId: "member", lastReadSequence: 6 }])
  })
  test("adding an already active member preserves their unread position", async () => {
    selects.push([{ nextMessageSequence: 7 }], [{ leftAt: null }], [{ id: "member", banned: false }])
    returningRows.push([])
    await addGroupMembers({ conversationId: "group-1", memberIds: ["member"] })
    expect(inserts).toHaveLength(1)
  })
  test("a mixed batch initializes read cursors only for new and rejoined members", async () => {
    selects.push(
      [{ nextMessageSequence: 7 }],
      [{ leftAt: null }],
      ["active", "new", "rejoined"].map((id) => ({ id, banned: false }))
    )
    returningRows.push([{ userId: "new" }, { userId: "rejoined" }])
    await addGroupMembers({ conversationId: "group-1", memberIds: ["rejoined", "active", "new", "active"] })
    expect(inserts).toEqual([
      ["active", "new", "rejoined"].map((userId) => ({ conversationId: "group-1", userId })),
      ["new", "rejoined"].map((userId) => ({ conversationId: "group-1", userId, lastReadSequence: 6 }))
    ])
  })
})
