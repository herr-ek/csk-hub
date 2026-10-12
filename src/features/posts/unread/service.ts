import "server-only"

import { and, count, eq, gt, isNotNull, lte, notExists, sql } from "drizzle-orm"
import { cache } from "react"
import { z } from "zod"
import { db } from "@/core/db"
import { post, postRead } from "@/core/db/schema/posts"

/**
 * How long a Post stays unread for a User who has not opened it. Without a horizon every
 * Post ever published would greet a newly invited User as unread; an announcement older
 * than a month is no longer news.
 */
const UNREAD_HORIZON_DAYS = 30

const postIdSchema = z.uuid()

/**
 * A Post is unread when it was published within the horizon and the User has not opened it.
 * A publication instant still ahead is not news yet.
 */
function unreadBy(userId: string) {
  return and(
    isNotNull(post.publishedAt),
    gt(post.publishedAt, sql`now() - make_interval(days => ${UNREAD_HORIZON_DAYS})`),
    lte(post.publishedAt, sql`now()`),
    notExists(
      db
        .select({ postId: postRead.postId })
        .from(postRead)
        .where(and(eq(postRead.userId, userId), eq(postRead.postId, post.id)))
    )
  )
}

/**
 * The number of published Posts from the last {@link UNREAD_HORIZON_DAYS} days that the User
 * has not opened. Posts without a publication instant never count. Shared within a render,
 * where both the navigation and the landing page ask for it.
 */
export const countUnreadPosts = cache(async (userId: string): Promise<number> => {
  const [row] = await db.select({ unread: count() }).from(post).where(unreadBy(userId))
  return row?.unread ?? 0
})

/** The ids of the Posts {@link countUnreadPosts} counts, for marking them in the feed. */
export async function listUnreadPostIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: post.id }).from(post).where(unreadBy(userId))
  return new Set(rows.map((row) => row.id))
}

/**
 * Records that the User has opened the Post. Ignores ids that are not published Posts.
 * Returns whether this was the first time, so a caller can skip refreshing a badge that
 * has not changed.
 */
export async function markPostRead(userId: string, postId: string): Promise<boolean> {
  if (!postIdSchema.safeParse(postId).success) return false

  // One statement: the Post is looked up as it is inserted, so a missing or unpublished
  // Post simply inserts nothing.
  const inserted = await db
    .insert(postRead)
    .select(
      db
        .select({
          userId: sql<string>`${userId}`.as("user_id"),
          postId: post.id,
          readAt: sql<Date>`now()`.as("read_at")
        })
        .from(post)
        .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
    )
    .onConflictDoNothing()
    .returning({ postId: postRead.postId })

  return inserted.length > 0
}
