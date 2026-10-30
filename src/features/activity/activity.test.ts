import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import { createTestDatabase } from "@test/database"
import { and, eq, inArray, sql } from "drizzle-orm"
import { createClient } from "redis"
import { activityDelivery } from "@/core/db/schema/activity"
import { session, user } from "@/core/db/schema/auth"
import { conversation, conversationReadState } from "@/core/db/schema/messaging"

// Real PostgreSQL/Redis, with only request identity and the external Web Push boundary replaced.
// Keep these mocks isolated from the existing action/command unit tests.
if (!process.env.CSK_ACTIVITY_TEST) {
  test("real-time delivery against isolated PostgreSQL and local Redis", async () => {
    const child = Bun.spawn([process.execPath, "test", "--isolate", import.meta.path], {
      env: { ...process.env, CSK_ACTIVITY_TEST: "1" },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (code !== 0) throw new Error(`${stdout}\n${stderr}`)
  }, 60_000)
} else {
  // Never connect integration tests to a remote broker, even when production env is present.
  process.env.REDIS_URL = "redis://localhost:6379"
  process.env.REDIS_KEY_PREFIX = `test:activity:${crypto.randomUUID()}`
  const database = await createTestDatabase()
  const redis = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 1_000, reconnectStrategy: false }
  })
  redis.on("error", () => {})
  let redisAvailable = false
  try {
    await redis.connect()
    redisAvailable = true
  } catch {
    /* Optional local service. */
  }
  if (!database || !redisAvailable) {
    if (redis.isOpen) redis.destroy()
    await database?.drop()
    test.skip("requires local PostgreSQL and Redis (docker compose up -d)", () => {})
  } else {
    const testDatabase = database
    const fixtureUsers: string[] = []
    const fixtureConversations: string[] = []
    const identity = new AsyncLocalStorage<{ userId: string; sessionId: string }>()
    mock.module("@/core/db", () => ({ db: testDatabase.db }))
    mock.module("@/core/auth/session.server", () => ({
      requireAuthenticatedUser: async () => {
        const current = identity.getStore()
        if (!current) throw new Error("Authentication required")
        return current.userId
      },
      getRequestSession: async () => {
        const current = identity.getStore()
        return current
          ? { user: { id: current.userId }, session: { id: current.sessionId, impersonatedBy: null } }
          : null
      }
    }))
    const push = mock(async () => ({ success: true, accepted: 1, failed: 0, failureCategories: {} }))
    mock.module("@/core/notifications", () => ({ sendToUser: push, sendToAll: push, sendToUsers: push }))
    const afterResponse: Array<() => Promise<void>> = []
    mock.module("next/server", () => ({ after: (callback: () => Promise<void>) => afterResponse.push(callback) }))
    const { env } = await import("@/core/config/env")
    const { queueActivity } = await import("@/core/realtime/outbox")
    const { activityStreamKey } = await import("@/core/realtime/broker")
    const { startDirectConversation, sendMessage } = await import("@/features/messaging/sending")
    const { createGroupConversation, leaveGroupConversation } = await import("@/features/messaging/group-conversations")
    const { markConversationRead } = await import("@/features/messaging/ui/conversation/read")
    const { createReadToken } = await import("@/features/messaging/ui/conversation/read-token")
    const { dispatchActivity, nextActivityDelay, pruneActivity } = await import("./dispatch")
    const { deliverPendingActivity } = await import("./deliver-pending")
    const { scheduleActivityDispatch } = await import("./schedule-dispatch")
    const { handleActivityStream } = await import("./stream")
    const { handleActivityAcknowledgement } = await import("./acknowledge")
    const { notifyUsers } = await import("./notifications")
    const { createPost, saveDraft, unpublishPost } = await import("@/features/posts/lifecycle")
    const { markPostRead, nextUnreadPostChangeAt } = await import("@/features/posts/unread/service")

    afterAll(async () => {
      for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_KEY_PREFIX}:*`, COUNT: 100 })) {
        if (keys.length) await redis.del(keys)
      }
      redis.destroy()
      await testDatabase.drop()
    })

    beforeEach(async () => {
      if (fixtureConversations.length)
        await testDatabase.db.delete(conversation).where(inArray(conversation.id, fixtureConversations))
      if (fixtureUsers.length) await testDatabase.db.delete(user).where(inArray(user.id, fixtureUsers))
      fixtureUsers.length = 0
      fixtureConversations.length = 0
      push.mockClear()
      afterResponse.length = 0
    })

    async function singer() {
      const userId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      await testDatabase.db.insert(user).values({ id: userId, name: "Singer", email: `${userId}@example.test` })
      fixtureUsers.push(userId)
      await testDatabase.db.insert(session).values({
        id: sessionId,
        userId,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
        updatedAt: new Date()
      })
      return { userId, sessionId }
    }

    async function direct() {
      const sender = await singer()
      const recipient = await singer()
      const idempotencyKey = crypto.randomUUID()
      const sent = await identity.run(sender, () =>
        startDirectConversation({
          recipientId: recipient.userId,
          text: "Private Message",
          idempotencyKey
        })
      )
      fixtureConversations.push(sent.conversationId)
      return { sender, recipient, sent, idempotencyKey }
    }

    async function messageDelivery(userId: string) {
      const [row] = await testDatabase.db
        .select()
        .from(activityDelivery)
        .where(and(eq(activityDelivery.userId, userId), sql`${activityDelivery.change}->>'kind' = 'message.created'`))
      if (!row) throw new Error("Expected a Message delivery")
      return row
    }

    async function makePushDue() {
      await testDatabase.db
        .update(activityDelivery)
        .set({ pushAfter: new Date(0) })
        .where(sql`${activityDelivery.body} IS NOT NULL`)
    }

    function acknowledgement(id: string, origin = "http://localhost:3001") {
      return new Request("http://localhost:3001/api/realtime/ack", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ id })
      })
    }

    async function streamAs(current: Awaited<ReturnType<typeof singer>>, cursor?: string) {
      const controller = new AbortController()
      const response = await identity.run(current, () =>
        handleActivityStream(
          new Request("http://localhost:3001/api/realtime/events", {
            signal: controller.signal,
            headers: cursor ? { "last-event-id": cursor } : undefined
          })
        )
      )
      expect(response.status).toBe(200)
      if (!response.body) throw new Error("Expected an SSE response body")
      const reader = response.body.getReader()
      const read = async () => {
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            const timer = setTimeout(() => reject(new Error("Stream did not deliver")), 3_000)
            timer.unref()
          })
        ])
        return new TextDecoder().decode(next.value)
      }
      return { read, close: () => controller.abort() }
    }

    async function storedDelivery(id: string) {
      const [delivery] = await testDatabase.db.select().from(activityDelivery).where(eq(activityDelivery.id, id))
      if (!delivery) throw new Error("Expected a stored delivery")
      return delivery
    }

    async function enqueue(userId: string) {
      const [delivery] = await testDatabase.db
        .insert(activityDelivery)
        .values({ userId, change: { kind: "unread.changed" } })
        .returning({ id: activityDelivery.id })
      if (!delivery) throw new Error("Expected an enqueued delivery")
      return delivery.id
    }

    async function waitUntil(check: () => Promise<boolean>) {
      const deadline = Date.now() + 2_000
      while (!(await check())) {
        if (Date.now() > deadline) throw new Error("Delivery did not progress before the deadline")
        await Bun.sleep(10)
      }
    }

    describe("real-time activity", () => {
      test("first Direct Message and exact retry create one recipient notification", async () => {
        const { sender, recipient, idempotencyKey, sent } = await direct()
        const retry = await identity.run(sender, () =>
          sendMessage({
            conversationId: sent.conversationId,
            text: "Private Message",
            idempotencyKey
          })
        )
        expect(retry.created).toBe(false)
        const rows = await testDatabase.db.select().from(activityDelivery)
        expect(rows).toHaveLength(2)
        expect(rows.filter((row) => row.userId === recipient.userId)).toHaveLength(1)
        expect(rows.find((row) => row.userId === sender.userId)?.body).toBeNull()
      })

      test("outbox rolls back with the feature write", async () => {
        const member = await singer()
        await expect(
          testDatabase.db.transaction(async (tx) => {
            await queueActivity(tx, [member.userId], { kind: "posts.changed" })
            throw new Error("Rollback")
          })
        ).rejects.toThrow("Rollback")
        expect(await testDatabase.db.select().from(activityDelivery)).toHaveLength(0)
      })

      test("an independent SSE connection receives committed activity without fetching on an interval", async () => {
        const { recipient } = await direct()
        const stream = await streamAs(recipient)
        try {
          expect(await stream.read()).toContain("event: ready")
          expect((await dispatchActivity()).processed).toBe(2)
          expect((await messageDelivery(recipient.userId)).publishedAt).not.toBeNull()
          const update = await stream.read()
          expect(update).toContain("event: activity")
          expect(update).toContain('"kind":"message.created"')
          expect(update).not.toContain("Private Message")
          expect(push).not.toHaveBeenCalled()
        } finally {
          stream.close()
        }
      })

      test("a visible toast cancels fallback without advancing the unread cursor", async () => {
        const { recipient, sent } = await direct()
        const delivery = await messageDelivery(recipient.userId)
        const response = await identity.run(recipient, () =>
          handleActivityAcknowledgement(acknowledgement(delivery.id))
        )
        expect(response.status).toBe(204)
        await makePushDue()
        await dispatchActivity()
        expect(push).not.toHaveBeenCalled()
        const [cursor] = await testDatabase.db
          .select()
          .from(conversationReadState)
          .where(
            and(
              eq(conversationReadState.userId, recipient.userId),
              eq(conversationReadState.conversationId, sent.conversationId)
            )
          )
        expect(cursor?.lastReadSequence).toBe(0)
      })

      test("only rendered signed history cancels a Conversation notification", async () => {
        const { recipient, sent } = await direct()
        await expect(
          identity.run(recipient, () => markConversationRead(sent.conversationId, 1, "forged"))
        ).rejects.toMatchObject({ kind: "read-position-invalid" })
        const token = createReadToken(sent.conversationId, recipient.userId, sent.sequence)
        await identity.run(recipient, () => markConversationRead(sent.conversationId, sent.sequence, token))
        await makePushDue()
        await dispatchActivity()
        expect(push).not.toHaveBeenCalled()
        expect((await messageDelivery(recipient.userId)).acknowledgedAt).not.toBeNull()
      })

      test("cross-User, cross-origin and revoked-session acknowledgements fail closed", async () => {
        const { sender, recipient } = await direct()
        const delivery = await messageDelivery(recipient.userId)
        expect(
          (await identity.run(sender, () => handleActivityAcknowledgement(acknowledgement(delivery.id)))).status
        ).toBe(404)
        expect(
          (
            await identity.run(recipient, () =>
              handleActivityAcknowledgement(acknowledgement(delivery.id, "https://elsewhere.test"))
            )
          ).status
        ).toBe(403)
        await testDatabase.db.delete(session).where(eq(session.id, recipient.sessionId))
        expect(
          (await identity.run(recipient, () => handleActivityAcknowledgement(acknowledgement(delivery.id)))).status
        ).toBe(401)
        expect((await messageDelivery(recipient.userId)).acknowledgedAt).toBeNull()
      })

      test("concurrent dispatches lease fallback once; presentation carries a Conversation link", async () => {
        const { recipient, sent } = await direct()
        await makePushDue()
        await Promise.all([dispatchActivity(), dispatchActivity()])
        expect(push).toHaveBeenCalledTimes(1)
        expect(push).toHaveBeenCalledWith(
          recipient.userId,
          "Private Message",
          expect.objectContaining({
            href: `/messages/${sent.conversationId}`
          })
        )
      })

      test("broker failure preserves publication for retry while offline push still works", async () => {
        const { recipient } = await direct()
        await makePushDue()
        const configured = env.REDIS_URL
        env.REDIS_URL = "redis://127.0.0.1:1"
        try {
          await dispatchActivity()
        } finally {
          env.REDIS_URL = configured
        }
        expect(push).toHaveBeenCalledTimes(1)
        expect((await messageDelivery(recipient.userId)).publishedAt).toBeNull()
        await testDatabase.db.update(activityDelivery).set({ publishAfter: new Date(0) })
        await dispatchActivity()
        expect((await messageDelivery(recipient.userId)).publishedAt).not.toBeNull()
        expect(push).toHaveBeenCalledTimes(1)
      })

      test("a departed Group member receives no queued future Message notification", async () => {
        const sender = await singer()
        const recipient = await singer()
        const group = await identity.run(sender, () =>
          createGroupConversation({
            name: "Planning",
            memberIds: [recipient.userId],
            idempotencyKey: crypto.randomUUID()
          })
        )
        fixtureConversations.push(group.conversationId)
        await identity.run(sender, () =>
          sendMessage({
            conversationId: group.conversationId,
            text: "Future activity",
            idempotencyKey: crypto.randomUUID()
          })
        )
        await identity.run(recipient, () => leaveGroupConversation(group.conversationId))
        await makePushDue()
        await dispatchActivity()
        expect(push).not.toHaveBeenCalled()
        expect(await redis.exists(activityStreamKey(recipient.userId))).toBe(1) // personal departure invalidation only
        const entries = await redis.xRange(activityStreamKey(recipient.userId), "-", "+")
        const delivery = await messageDelivery(recipient.userId)
        expect(entries?.some((entry) => entry.message.delivery === delivery.id)).toBe(false)
      })

      test("reconnect replays retained events and invalid cursors still reconcile", async () => {
        const { recipient } = await direct()
        await dispatchActivity()
        const replay = await streamAs(recipient, "0-0")
        try {
          expect(await replay.read()).toContain("event: ready")
          expect(await replay.read()).toContain("message.created")
        } finally {
          replay.close()
        }
        const invalid = await streamAs(recipient, "invalid-cursor")
        try {
          expect(await invalid.read()).toContain("event: ready")
        } finally {
          invalid.close()
        }
      })

      test("revoking a connected session prevents the next event from being exposed", async () => {
        const { recipient } = await direct()
        const stream = await streamAs(recipient)
        try {
          await stream.read()
          await testDatabase.db.delete(session).where(eq(session.id, recipient.sessionId))
          await dispatchActivity()
          expect(await stream.read()).not.toContain("message.created")
        } finally {
          stream.close()
        }
      })

      test("published Post events and personal reads propagate, Draft content stays private", async () => {
        const member = await singer()
        const content = { title: "Private Draft", body: { type: "doc" as const, content: [] } }
        const post = await createPost({ authorId: member.userId, content, publish: false })
        expect(await testDatabase.db.select().from(activityDelivery)).toHaveLength(0)
        await saveDraft({ authorId: member.userId, postId: post.id, content, publish: true })
        expect((await testDatabase.db.select().from(activityDelivery))[0]?.change).toEqual({ kind: "posts.changed" })
        expect(await nextUnreadPostChangeAt(member.userId)).toBeGreaterThan(Date.now())
        await markPostRead(member.userId, post.id)
        expect(
          (await testDatabase.db.select().from(activityDelivery)).some((row) => row.change.kind === "unread.changed")
        ).toBe(true)
        expect(await nextUnreadPostChangeAt(member.userId)).toBeNull()
        await unpublishPost(post.id)
        expect(
          (await testDatabase.db.select().from(activityDelivery)).filter((row) => row.change.kind === "posts.changed")
        ).toHaveLength(2)
      })

      test("notifications include active Users without push subscriptions", async () => {
        const member = await singer()
        const inactive = await singer()
        await testDatabase.db.update(user).set({ banned: true }).where(eq(user.id, inactive.userId))
        expect(await notifyUsers("Rehearsal moved")).toEqual({ success: true, queued: 1 })
        const rows = await testDatabase.db.select().from(activityDelivery)
        expect(rows).toHaveLength(1)
        expect(rows[0]?.userId).toBe(member.userId)
      })

      test("the next deadline respects active leases and ignores acknowledged push", async () => {
        const { recipient } = await direct()
        await dispatchActivity()
        const delivery = await messageDelivery(recipient.userId)
        await testDatabase.db
          .update(activityDelivery)
          .set({
            pushAfter: sql`now() + interval '2 seconds'`,
            leaseUntil: sql`now() + interval '5 seconds'`,
            leaseToken: crypto.randomUUID()
          })
          .where(eq(activityDelivery.id, delivery.id))
        const delay = await nextActivityDelay()
        expect(delay).toBeGreaterThan(4_000)
        expect(delay).toBeLessThanOrEqual(5_000)
        await testDatabase.db
          .update(activityDelivery)
          .set({ acknowledgedAt: new Date() })
          .where(eq(activityDelivery.id, delivery.id))
        expect(await nextActivityDelay()).toBeNull()
      })

      test("the response callback publishes immediately and sends push after the eight-second grace", async () => {
        const { recipient } = await direct()
        const delivery = await messageDelivery(recipient.userId)
        if (!delivery.pushAfter) throw new Error("Expected a push deadline")
        scheduleActivityDispatch()
        expect((await storedDelivery(delivery.id)).publishedAt).toBeNull()
        const callback = afterResponse.pop()
        if (!callback) throw new Error("Expected an after-response callback")
        const running = callback()
        try {
          await waitUntil(async () => (await storedDelivery(delivery.id)).publishedAt !== null)
          expect(push).not.toHaveBeenCalled()
        } finally {
          await running
        }
        const completed = await storedDelivery(delivery.id)
        // Both timestamps come from Postgres; the container and host clocks can differ.
        expect(completed.pushCompletedAt?.getTime()).toBeGreaterThanOrEqual(delivery.pushAfter.getTime())
        expect(push).toHaveBeenCalledTimes(1)
      }, 15_000)

      test("acknowledgement during the grace period cancels push in the response callback", async () => {
        const { recipient } = await direct()
        const delivery = await messageDelivery(recipient.userId)
        await testDatabase.db
          .update(activityDelivery)
          .set({ pushAfter: sql`now() + interval '400 milliseconds'` })
          .where(eq(activityDelivery.id, delivery.id))
        const running = deliverPendingActivity()
        try {
          await waitUntil(async () => (await storedDelivery(delivery.id)).publishedAt !== null)
          await identity.run(recipient, () => handleActivityAcknowledgement(acknowledgement(delivery.id)))
        } finally {
          await running
        }
        expect(push).not.toHaveBeenCalled()
        expect(await nextActivityDelay()).toBeNull()
      })

      test("an expired request leaves pending work for a later dispatch", async () => {
        const member = await singer()
        const id = await enqueue(member.userId)
        await testDatabase.db
          .update(activityDelivery)
          .set({ leaseToken: crypto.randomUUID(), leaseUntil: sql`now() + interval '300 milliseconds'` })
          .where(eq(activityDelivery.id, id))
        await deliverPendingActivity(AbortSignal.timeout(50))
        expect((await storedDelivery(id)).publishedAt).toBeNull()
        await deliverPendingActivity()
        expect((await storedDelivery(id)).publishedAt).not.toBeNull()
      })

      test("retention runs independently of dispatch and preserves recent pending work", async () => {
        const member = await singer()
        const expired = await enqueue(member.userId)
        const recent = await enqueue(member.userId)
        await testDatabase.db
          .update(activityDelivery)
          .set({ createdAt: sql`now() - interval '8 days'` })
          .where(eq(activityDelivery.id, expired))
        await pruneActivity()
        const rows = await testDatabase.db.select().from(activityDelivery)
        expect(rows.map(({ id }) => id)).toEqual([recent])
      })
    })
  }
}
