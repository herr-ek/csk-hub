import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createTestDatabase } from "@test/database"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"

const database = await createTestDatabase()

mock.module("@/core/db", () => ({ db: database?.db }))

const { countUnreadPosts, listUnreadPostIds, markPostRead } = await import("./service")

const DAY = 24 * 60 * 60 * 1000

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY)
}

describe.skipIf(!database)("unread Posts", () => {
  const { db, drop } = database as NonNullable<typeof database>
  afterAll(() => drop())

  beforeEach(async () => {
    await db.delete(post)
  })

  async function createUser() {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name: "Singer", email: `${id}@example.test` })
    return id
  }

  async function publish(publishedAt: Date | null) {
    const [created] = await db
      .insert(post)
      .values({ title: "Rehearsal moved", body: { type: "doc", content: [] }, publishedAt })
      .returning({ id: post.id })
    return (created as { id: string }).id
  }

  test("a Post from the last month is unread until the User opens it", async () => {
    const userId = await createUser()
    const opened = await publish(daysAgo(2))
    const unopened = await publish(daysAgo(1))

    expect(await markPostRead(userId, opened)).toBe(true)

    expect(await countUnreadPosts(userId)).toBe(1)
    expect(await listUnreadPostIds(userId)).toEqual(new Set([unopened]))
  })

  test("Posts older than a month are no longer unread", async () => {
    const userId = await createUser()
    await publish(daysAgo(40))
    const recent = await publish(daysAgo(10))

    expect(await countUnreadPosts(userId)).toBe(1)
    expect(await listUnreadPostIds(userId)).toEqual(new Set([recent]))
  })

  test("unpublished Posts are never unread and cannot be marked read", async () => {
    const userId = await createUser()
    const draft = await publish(null)

    expect(await countUnreadPosts(userId)).toBe(0)
    expect(await markPostRead(userId, draft)).toBe(false)
  })

  test("opening a Post again reports no change", async () => {
    const userId = await createUser()
    const postId = await publish(daysAgo(1))

    expect(await markPostRead(userId, postId)).toBe(true)
    expect(await markPostRead(userId, postId)).toBe(false)
  })

  test("ignores ids that are not Posts", async () => {
    const userId = await createUser()

    expect(await markPostRead(userId, "not-a-uuid")).toBe(false)
    expect(await markPostRead(userId, crypto.randomUUID())).toBe(false)
  })

  test("one User opening a Post leaves it unread for others", async () => {
    const reader = await createUser()
    const other = await createUser()
    const postId = await publish(daysAgo(1))

    await markPostRead(reader, postId)

    expect(await countUnreadPosts(reader)).toBe(0)
    expect(await countUnreadPosts(other)).toBe(1)
  })
})
