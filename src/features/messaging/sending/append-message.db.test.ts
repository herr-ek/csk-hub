import { describe, expect } from "bun:test"
import type { TestDatabase } from "@test/database"
import { databaseTest } from "@test/database-test"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { conversation, conversationReadState, message } from "@/core/db/schema/messaging"
import { appendMessage } from "./append-message"

async function messageFixture({ db }: TestDatabase) {
  const authorUserId = crypto.randomUUID()
  await db.insert(user).values({ id: authorUserId, name: "Sender", email: `${authorUserId}@example.com` })
  const [first, second] = await db
    .insert(conversation)
    .values([{ kind: "direct" }, { kind: "direct" }])
    .returning()
  await db.insert(conversationReadState).values([
    { conversationId: first.id, userId: authorUserId },
    { conversationId: second.id, userId: authorUserId }
  ])
  const input = { conversationId: first.id, authorUserId, text: "Hello", idempotencyKey: "request-1" }
  return {
    db,
    first,
    second,
    input,
    send: (overrides: Partial<typeof input> = {}) =>
      db.transaction((tx) => appendMessage(tx, { ...input, ...overrides }))
  }
}

const test = databaseTest(messageFixture)

describe("appendMessage persistence", () => {
  test("rejects an idempotency key reused for different persisted content", async ({ db, send }) => {
    await send()
    await expect(send({ text: "Different" })).rejects.toMatchObject({ kind: "idempotency-key-reused" })
    expect(await db.select().from(message)).toHaveLength(1)
  })

  test("rejects an idempotency key reused in another conversation", async ({ db, second, send }) => {
    await send()
    await expect(send({ conversationId: second.id })).rejects.toMatchObject({ kind: "idempotency-key-reused" })
    const [untouched] = await db.select().from(conversation).where(eq(conversation.id, second.id))
    expect(untouched.nextMessageSequence).toBe(1)
    expect(await db.select().from(message)).toHaveLength(1)
  })

  test("concurrent retries persist one message and allocate one sequence", async ({ db, first, send }) => {
    const results = await Promise.all(Array.from({ length: 8 }, () => send()))
    expect(new Set(results.map(({ id }) => id)).size).toBe(1)
    expect(results.filter(({ created }) => created)).toHaveLength(1)
    expect(await db.select().from(message)).toHaveLength(1)
    const [row] = await db.select().from(conversation).where(eq(conversation.id, first.id))
    expect(row.nextMessageSequence).toBe(2)
    const [cursor] = await db
      .select()
      .from(conversationReadState)
      .where(eq(conversationReadState.conversationId, first.id))
    expect(cursor.lastReadSequence).toBe(1)
  })

  test("concurrent sends allocate contiguous sequences and advance the sender's read cursor", async ({
    db,
    first,
    send
  }) => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => send({ idempotencyKey: `request-${index}` }))
    )
    expect(results.map(({ sequence }) => sequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(await db.select().from(message)).toHaveLength(8)
    const [cursor] = await db
      .select()
      .from(conversationReadState)
      .where(eq(conversationReadState.conversationId, first.id))
    expect(cursor.lastReadSequence).toBe(8)
  })

  test("rolls back the message, sequence allocation and read cursor together", async ({ db, first, input }) => {
    const failure = new Error("rollback requested")
    await expect(
      db.transaction(async (tx) => {
        await appendMessage(tx, input)
        throw failure
      })
    ).rejects.toBe(failure)
    expect(await db.select().from(message)).toEqual([])
    const [row] = await db.select().from(conversation).where(eq(conversation.id, first.id))
    expect(row.nextMessageSequence).toBe(1)
    const [cursor] = await db
      .select()
      .from(conversationReadState)
      .where(eq(conversationReadState.conversationId, first.id))
    expect(cursor.lastReadSequence).toBe(0)
  })
})
