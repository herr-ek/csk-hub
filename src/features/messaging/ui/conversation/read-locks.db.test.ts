import { describe, expect, mock } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import type { TestDatabase } from "@test/database"
import { databaseTest } from "@test/database-test"
import { and, eq, sql } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import {
  conversation,
  conversationReadState,
  directConversation,
  groupConversation,
  groupMembership
} from "@/core/db/schema/messaging"
import type { MessageTransaction } from "../../sending"

let currentDatabase: TestDatabase
const test = databaseTest((database: TestDatabase) => {
  currentDatabase = database
  return database
})
const identity = new AsyncLocalStorage<string>()
let holdNextTransaction: { ready: () => void; release: Promise<void> } | undefined

mock.module("@/core/auth/session.server", () => ({ requireAuthenticatedUser: async () => identity.getStore() }))
mock.module("@/core/db", () => ({
  db: {
    select: (...args: Parameters<TestDatabase["db"]["select"]>) => currentDatabase.db.select(...args),
    transaction: async (work: (tx: MessageTransaction) => Promise<unknown>) => {
      const hold = holdNextTransaction
      holdNextTransaction = undefined
      return currentDatabase.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '300ms'`)
        await tx.execute(sql`SET LOCAL statement_timeout = '2s'`)
        const result = await work(tx)
        if (hold) {
          hold.ready()
          await hold.release
        }
        return result
      })
    }
  }
}))

const { sendMessage } = await import("../../sending")
const { leaveGroupConversation } = await import("../../group-conversations")
const { getConversationPage } = await import("./query")
const { markConversationRead } = await import("./read")
const { createReadToken } = await import("./read-token")

describe("Conversation read concurrency", () => {
  async function fixture(t: TestDatabase, kind: "direct" | "group") {
    const suffix = crypto.randomUUID()
    const reader = `a-${suffix}`
    const sender = `b-${suffix}`
    await t.db.insert(user).values([reader, sender].map((id) => ({ id, name: id, email: `${id}@example.test` })))
    const [created] = await t.db.insert(conversation).values({ kind }).returning({ id: conversation.id })
    if (!created) throw new Error("Conversation fixture was not created")
    const id = created.id
    if (kind === "group") {
      await t.db.insert(groupConversation).values({ conversationId: id, name: "Planning" })
      await t.db.insert(groupMembership).values([reader, sender].map((userId) => ({ conversationId: id, userId })))
    } else {
      await t.db
        .insert(directConversation)
        .values({ conversationId: id, firstMemberId: reader, secondMemberId: sender })
    }
    await t.db.insert(conversationReadState).values([reader, sender].map((userId) => ({ conversationId: id, userId })))
    const send = () =>
      identity.run(sender, () =>
        sendMessage({ conversationId: id, text: "Hello", idempotencyKey: crypto.randomUUID() })
      )
    await send()
    const markRead = () => identity.run(reader, () => markConversationRead(id, 1, createReadToken(id, reader, 1)))
    const page = () => identity.run(reader, () => getConversationPage(id))
    return { id, reader, send, markRead, page }
  }

  /** Keep a completed operation's transaction open, then run another operation with its locks held. */
  async function whileTransactionOpen(first: () => Promise<unknown>, second: () => Promise<unknown>) {
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    holdNextTransaction = { ready: () => ready.resolve(), release: release.promise }
    const pending = first()
    try {
      await Promise.race([
        ready.promise,
        pending.then(() => {
          throw new Error("Expected an open transaction")
        })
      ])
      await second()
    } finally {
      release.resolve()
      await pending
    }
  }

  for (const kind of ["direct", "group"] as const) {
    test(`${kind} read markers do not block another member's send`, async (t) => {
      const f = await fixture(t, kind)
      await whileTransactionOpen(f.markRead, async () => {
        expect(await f.send()).toMatchObject({ sequence: 2, created: true })
      })
    })

    test(`${kind} read markers and timelines do not wait for an open send`, async (t) => {
      const f = await fixture(t, kind)
      await whileTransactionOpen(f.send, async () => {
        await f.markRead()
        expect((await f.page()).messages.map((message) => message.sequence)).toEqual([1])
      })
    })
  }

  test("a group timeline does not block another member's send", async (t) => {
    const f = await fixture(t, "group")
    await whileTransactionOpen(f.page, async () => {
      expect(await f.send()).toMatchObject({ sequence: 2, created: true })
    })
  })

  for (const read of ["page", "markRead"] as const) {
    test(`a group ${read} holds the departure cutoff stable until it commits`, async (t) => {
      const f = await fixture(t, "group")
      await whileTransactionOpen(f[read], async () => {
        await expect(identity.run(f.reader, () => leaveGroupConversation(f.id))).rejects.toMatchObject({
          cause: { code: "55P03" }
        })
      })
      await identity.run(f.reader, () => leaveGroupConversation(f.id))
      await f.send()
      expect(await f.page()).toMatchObject({ canSend: false, newestSequence: 1, members: [] })
      await f.markRead()
      await expect(
        identity.run(f.reader, () => markConversationRead(f.id, 2, createReadToken(f.id, f.reader, 2)))
      ).rejects.toMatchObject({ kind: "conversation-view-forbidden" })
      const [cursor] = await t.db
        .select()
        .from(conversationReadState)
        .where(and(eq(conversationReadState.conversationId, f.id), eq(conversationReadState.userId, f.reader)))
      expect(cursor?.lastReadSequence).toBe(1)
    })
  }
})
