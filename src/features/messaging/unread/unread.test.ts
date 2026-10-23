import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createTestDatabase } from "@test/database"
import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import {
  conversation,
  conversationReadState,
  directConversation,
  groupConversation,
  groupMembership,
  message
} from "@/core/db/schema/messaging"

const database = await createTestDatabase()

mock.module("@/core/db", () => ({ db: database?.db }))

const { countUnreadConversations } = await import("./service")

describe.skipIf(!database)("unread Conversations", () => {
  const { db, drop } = database as NonNullable<typeof database>
  afterAll(() => drop())

  beforeEach(async () => {
    await db.delete(conversation)
  })

  async function createUser() {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name: "Singer", email: `${id}@example.test` })
    return id
  }

  async function startDirect(...pair: [string, string]) {
    // Direct Conversations store the pair in order.
    const [firstMemberId, secondMemberId] = pair.sort()
    const [created] = await db.insert(conversation).values({ kind: "direct" }).returning({ id: conversation.id })
    const id = (created as { id: string }).id
    await db.insert(directConversation).values({ conversationId: id, firstMemberId, secondMemberId })
    await db
      .insert(conversationReadState)
      .values([firstMemberId, secondMemberId].map((userId) => ({ conversationId: id, userId })))
    return id
  }

  async function startGroup(memberIds: string[]) {
    const [created] = await db.insert(conversation).values({ kind: "group" }).returning({ id: conversation.id })
    const id = (created as { id: string }).id
    await db.insert(groupConversation).values({ conversationId: id, name: "Planning" })
    await db.insert(groupMembership).values(memberIds.map((userId) => ({ conversationId: id, userId })))
    await db.insert(conversationReadState).values(memberIds.map((userId) => ({ conversationId: id, userId })))
    return id
  }

  /** Appends a Message as sending does: the author's own cursor moves past it. */
  async function send(conversationId: string, authorUserId: string, sequence: number) {
    await db
      .insert(message)
      .values({ conversationId, authorUserId, sequence, text: "Hello", idempotencyKey: crypto.randomUUID() })
    await readThrough(conversationId, authorUserId, sequence)
  }

  async function readThrough(conversationId: string, userId: string, sequence: number) {
    await db
      .update(conversationReadState)
      .set({ lastReadSequence: sequence })
      .where(and(eq(conversationReadState.conversationId, conversationId), eq(conversationReadState.userId, userId)))
  }

  test("a Conversation counts once however many Messages are unread in it", async () => {
    const [reader, first, second] = [await createUser(), await createUser(), await createUser()]
    const one = await startDirect(reader, first)
    const other = await startDirect(second, reader)
    await send(one, first, 1)
    await send(one, first, 2)
    await send(other, second, 1)

    expect(await countUnreadConversations(reader)).toBe(2)
  })

  test("the User's own Messages are not unread to them", async () => {
    const [author, recipient] = [await createUser(), await createUser()]
    const id = await startDirect(author, recipient)
    await send(id, author, 1)

    expect(await countUnreadConversations(author)).toBe(0)
    expect(await countUnreadConversations(recipient)).toBe(1)
  })

  test("a Conversation read through its newest Message is no longer unread", async () => {
    const [reader, sender] = [await createUser(), await createUser()]
    const id = await startDirect(reader, sender)
    await send(id, sender, 1)
    await send(id, sender, 2)

    await readThrough(id, reader, 1)
    expect(await countUnreadConversations(reader)).toBe(1)

    await readThrough(id, reader, 2)
    expect(await countUnreadConversations(reader)).toBe(0)
  })

  test("a former group member counts only the history retained for them", async () => {
    const [former, sender] = [await createUser(), await createUser()]
    const id = await startGroup([former, sender])
    await send(id, sender, 1)
    await db
      .update(groupMembership)
      .set({ leftAt: new Date(), historyVisibleThroughSequence: 1 })
      .where(and(eq(groupMembership.conversationId, id), eq(groupMembership.userId, former)))

    expect(await countUnreadConversations(former)).toBe(1)

    await readThrough(id, former, 1)
    await send(id, sender, 2)
    expect(await countUnreadConversations(former)).toBe(0)
  })

  test("an active group member counts new Messages", async () => {
    const [member, sender] = [await createUser(), await createUser()]
    const id = await startGroup([member, sender])
    await send(id, sender, 1)

    expect(await countUnreadConversations(member)).toBe(1)
  })
})
