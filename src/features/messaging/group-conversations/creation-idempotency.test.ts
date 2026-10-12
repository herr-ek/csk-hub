import { afterAll, describe, expect, mock, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import { createTestDatabase } from "@test/database"
import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import {
  conversation,
  conversationReadState,
  groupConversation,
  groupMembership,
  message
} from "@/core/db/schema/messaging"
import type { MessageTransaction } from "../sending"

// Run real commands in a separate process so other messaging tests cannot replace them.
if (!process.env.CSK_GROUP_CREATION_TEST) {
  test("Group creation idempotency against isolated PostgreSQL", async () => {
    const child = Bun.spawn([process.execPath, "test", "--isolate", import.meta.path], {
      env: { ...process.env, CSK_GROUP_CREATION_TEST: "1" },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (code !== 0) throw new Error(`${stdout}\n${stderr}`)
  }, 15_000)
} else {
  const database = await createTestDatabase()
  const identity = new AsyncLocalStorage<string>()
  let failBeforeCommit = false
  mock.module("@/core/auth/session.server", () => ({ requireAuthenticatedUser: async () => identity.getStore() }))
  mock.module("@/core/db", () => ({
    db: {
      transaction: async <T>(work: (tx: MessageTransaction) => Promise<T>) => {
        if (!database) throw new Error("Local test database is unavailable")
        return database.db.transaction(async (tx) => {
          const result = await work(tx)
          if (failBeforeCommit) {
            failBeforeCommit = false
            throw new Error("Simulated failure before commit")
          }
          return result
        })
      }
    }
  }))
  const { addGroupMembers, createGroupConversation, leaveGroupConversation, renameGroupConversation } = await import(
    "./commands"
  )

  describe.skipIf(!database)("Group creation idempotency", () => {
    const t = database as NonNullable<typeof database>
    afterAll(() => t.drop())

    async function fixture() {
      const ids = Array.from({ length: 4 }, () => crypto.randomUUID())
      await t.db.insert(user).values(ids.map((id) => ({ id, name: id, email: `${id}@example.test` })))
      const [creator, first, second, extra] = ids as [string, string, string, string]
      const input = { name: "Planning", memberIds: [first, second], idempotencyKey: crypto.randomUUID() }
      const create = (changes: Partial<typeof input> = {}, creatorId = creator) =>
        identity.run(creatorId, () => createGroupConversation({ ...input, ...changes }))
      return { creator, first, second, extra, input, create }
    }

    test("concurrent and later retries create one group, its memberships and its read cursors", async () => {
      const f = await fixture()
      const results = await Promise.all(Array.from({ length: 8 }, () => f.create()))
      expect(new Set(results.map((result) => result.conversationId)).size).toBe(1)
      const original = results[0] as { conversationId: string }
      expect(await f.create({ name: "  Planning  ", memberIds: [f.second, f.first, f.first, f.creator] })).toEqual(
        original
      )
      expect(
        await t.db.select().from(groupConversation).where(eq(groupConversation.createdByUserId, f.creator))
      ).toHaveLength(1)
      expect(
        await t.db.select().from(groupMembership).where(eq(groupMembership.conversationId, original.conversationId))
      ).toHaveLength(3)
      expect(
        await t.db
          .select()
          .from(conversationReadState)
          .where(eq(conversationReadState.conversationId, original.conversationId))
      ).toHaveLength(3)
      expect(await t.db.select().from(message).where(eq(message.conversationId, original.conversationId))).toHaveLength(
        0
      )
    })

    test("a creator cannot reuse a creation key with a different name or member set", async () => {
      const f = await fixture()
      const original = await f.create()
      for (const changes of [{ name: "Other" }, { memberIds: [f.first, f.extra] }]) {
        await expect(f.create(changes)).rejects.toMatchObject({ kind: "idempotency-key-reused" })
      }
      expect(await f.create()).toEqual(original)
      expect(
        await t.db.select().from(groupConversation).where(eq(groupConversation.createdByUserId, f.creator))
      ).toHaveLength(1)
    })

    test("concurrent conflicting requests persist one intent and reject the other", async () => {
      const f = await fixture()
      const results = await Promise.allSettled([f.create(), f.create({ name: "Other" })])
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult
      expect(rejected.reason).toMatchObject({ kind: "idempotency-key-reused" })
      expect(
        await t.db.select().from(groupConversation).where(eq(groupConversation.createdByUserId, f.creator))
      ).toHaveLength(1)
    })

    test("keys are scoped to the creator, and a new key can intentionally create an identical group", async () => {
      const f = await fixture()
      const original = await f.create()
      const anotherCreator = await f.create({}, f.extra)
      const newIntent = await f.create({ idempotencyKey: crypto.randomUUID() })
      expect(new Set([original.conversationId, anotherCreator.conversationId, newIntent.conversationId]).size).toBe(3)
    })

    test("retrying after rename, membership changes and departure returns the original without resetting state", async () => {
      const f = await fixture()
      const original = await f.create()
      await identity.run(f.creator, () => renameGroupConversation({ ...original, name: "Renamed" }))
      await identity.run(f.creator, () => addGroupMembers({ ...original, memberIds: [f.extra] }))
      await identity.run(f.creator, () => leaveGroupConversation(original.conversationId))
      await t.db.update(user).set({ banned: true }).where(eq(user.id, f.first))
      expect(await f.create()).toEqual(original)
      const [group] = await t.db
        .select()
        .from(groupConversation)
        .where(eq(groupConversation.conversationId, original.conversationId))
      expect(group?.name).toBe("Renamed")
      const members = await t.db
        .select()
        .from(groupMembership)
        .where(eq(groupMembership.conversationId, original.conversationId))
      expect(members).toHaveLength(4)
      expect(members.find((member) => member.userId === f.creator)?.leftAt).toBeInstanceOf(Date)
    })

    test("bulk additions preserve active unread cursors and initialize new and rejoined members", async () => {
      const f = await fixture()
      const original = await f.create()
      await t.db
        .update(conversation)
        .set({ nextMessageSequence: 7 })
        .where(eq(conversation.id, original.conversationId))
      await t.db
        .update(conversationReadState)
        .set({ lastReadSequence: 2 })
        .where(eq(conversationReadState.conversationId, original.conversationId))
      await identity.run(f.second, () => leaveGroupConversation(original.conversationId))
      const [before] = await t.db
        .select()
        .from(groupMembership)
        .where(and(eq(groupMembership.conversationId, original.conversationId), eq(groupMembership.userId, f.first)))

      const add = () =>
        identity.run(f.creator, () =>
          addGroupMembers({
            ...original,
            memberIds: [f.extra, f.second, f.first, f.second]
          })
        )
      await add()
      await add()

      const members = await t.db
        .select()
        .from(groupMembership)
        .where(eq(groupMembership.conversationId, original.conversationId))
      expect(members).toHaveLength(4)
      expect(members.every((member) => member.leftAt === null && member.historyVisibleThroughSequence === null)).toBe(
        true
      )
      expect(members.find((member) => member.userId === f.first)?.joinedAt).toEqual(before?.joinedAt)
      const cursors = await t.db
        .select()
        .from(conversationReadState)
        .where(eq(conversationReadState.conversationId, original.conversationId))
      expect(cursors).toHaveLength(4)
      expect(Object.fromEntries(cursors.map((cursor) => [cursor.userId, cursor.lastReadSequence]))).toEqual({
        [f.creator]: 2,
        [f.first]: 2,
        [f.second]: 6,
        [f.extra]: 6
      })
    })

    test("blank keys are rejected and failed creation leaves the key available for a retry", async () => {
      const f = await fixture()
      await expect(f.create({ idempotencyKey: "  " })).rejects.toMatchObject({ kind: "idempotency-key-required" })
      await t.db.update(user).set({ banned: true }).where(eq(user.id, f.first))
      await expect(f.create()).rejects.toMatchObject({ kind: "recipient-inactive" })
      expect(
        await t.db.select().from(groupConversation).where(eq(groupConversation.createdByUserId, f.creator))
      ).toHaveLength(0)
      await t.db.update(user).set({ banned: false }).where(eq(user.id, f.first))
      expect(await f.create()).toHaveProperty("conversationId")
    })

    test("a transaction failure rolls back the group and allows retrying the same key", async () => {
      const f = await fixture()
      failBeforeCommit = true
      await expect(f.create()).rejects.toThrow("Simulated failure before commit")
      expect(
        await t.db.select().from(groupConversation).where(eq(groupConversation.createdByUserId, f.creator))
      ).toHaveLength(0)
      expect(await t.db.select().from(groupMembership).where(eq(groupMembership.userId, f.creator))).toHaveLength(0)
      expect(
        await t.db.select().from(conversationReadState).where(eq(conversationReadState.userId, f.creator))
      ).toHaveLength(0)
      const original = await f.create()
      expect(await f.create()).toEqual(original)
    })

    test("the database rejects duplicate creator/key pairs even without the advisory lock", async () => {
      const f = await fixture()
      const original = await f.create()
      const [intent] = await t.db
        .select()
        .from(groupConversation)
        .where(eq(groupConversation.conversationId, original.conversationId))
      if (!intent) throw new Error("Creation intent was not persisted")
      await expect(
        t.db.transaction(async (tx) => {
          const [created] = await tx.insert(conversation).values({ kind: "group" }).returning({ id: conversation.id })
          if (!created) throw new Error("Conversation fixture was not created")
          await tx.insert(groupConversation).values({ ...intent, conversationId: created.id })
        })
      ).rejects.toMatchObject({ cause: { code: "23505", constraint: "groupConversation_creator_creation_key_unique" } })
    })

    test("legacy groups remain valid without a creation key or fingerprint", async () => {
      const f = await fixture()
      const [created] = await t.db.insert(conversation).values({ kind: "group" }).returning({ id: conversation.id })
      if (!created) throw new Error("Conversation fixture was not created")
      await t.db
        .insert(groupConversation)
        .values({ conversationId: created.id, name: "Legacy", createdByUserId: f.creator })
      await t.db.insert(groupMembership).values({ conversationId: created.id, userId: f.creator })
      await identity.run(f.creator, () => renameGroupConversation({ conversationId: created.id, name: "Still works" }))
      const [legacy] = await t.db
        .select()
        .from(groupConversation)
        .where(eq(groupConversation.conversationId, created.id))
      expect(legacy).toMatchObject({ name: "Still works", creationIdempotencyKey: null, creationPayloadHash: null })
    })
  })
}
