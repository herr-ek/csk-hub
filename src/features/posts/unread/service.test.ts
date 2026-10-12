import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createTestDatabase } from "@test/database"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { newsFeedReadState, post } from "@/core/db/schema/posts"

const database = await createTestDatabase()

mock.module("@/core/db", () => ({ db: database?.db }))

const { countUnreadPosts, markNewsFeedSeen } = await import("./service")

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

  async function lastSeenAt(userId: string) {
    const [row] = await db.select().from(newsFeedReadState).where(eq(newsFeedReadState.userId, userId))
    return row?.lastSeenAt
  }

  test("a User who has never opened the feed counts only the last month's Posts", async () => {
    const userId = await createUser()
    await publish(daysAgo(40))
    await publish(daysAgo(10))
    await publish(daysAgo(1))

    expect(await countUnreadPosts(userId)).toBe(2)
  })

  test("unpublished Posts never count", async () => {
    const userId = await createUser()
    await publish(null)

    expect(await countUnreadPosts(userId)).toBe(0)
  })

  test("seeing the feed clears the Posts it showed and keeps later ones unread", async () => {
    const userId = await createUser()
    await publish(daysAgo(3))
    const newest = await publish(daysAgo(2))

    expect(await markNewsFeedSeen(userId, newest)).toBe(true)
    expect(await countUnreadPosts(userId)).toBe(0)

    // Published after the feed rendered, so the User has not seen it yet.
    await publish(daysAgo(1))
    expect(await countUnreadPosts(userId)).toBe(1)
  })

  test("a stale feed does not move the stamp back", async () => {
    const userId = await createUser()
    const newerAt = daysAgo(2)
    const older = await publish(daysAgo(3))
    const newer = await publish(newerAt)
    await markNewsFeedSeen(userId, newer)

    expect(await markNewsFeedSeen(userId, older)).toBe(false)
    expect(await markNewsFeedSeen(userId, newer)).toBe(false)
    expect(await lastSeenAt(userId)).toEqual(newerAt)
  })

  test("ignores ids that are not published Posts", async () => {
    const userId = await createUser()
    const draft = await publish(null)

    expect(await markNewsFeedSeen(userId, draft)).toBe(false)
    expect(await markNewsFeedSeen(userId, "not-a-uuid")).toBe(false)
    expect(await markNewsFeedSeen(userId, crypto.randomUUID())).toBe(false)
    expect(await lastSeenAt(userId)).toBeUndefined()
  })

  test("another User's visit does not clear the badge", async () => {
    const reader = await createUser()
    const other = await createUser()
    const postId = await publish(daysAgo(1))

    await markNewsFeedSeen(reader, postId)

    expect(await countUnreadPosts(reader)).toBe(0)
    expect(await countUnreadPosts(other)).toBe(1)
  })
})
