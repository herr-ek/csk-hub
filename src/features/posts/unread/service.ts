import "server-only"

import { and, count, eq, gt, isNotNull, lt, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/core/db"
import { newsFeedReadState, post } from "@/core/db/schema/posts"

/**
 * How far back the badge reaches for a User who has never opened the News feed. Counting
 * every Post ever published would greet a newly invited User with a number that means
 * nothing, and zero would hide the announcements they most need; the last month is what
 * is still worth reading.
 */
const UNVISITED_LOOKBACK_DAYS = 30

const postIdSchema = z.uuid()

/**
 * The number of published Posts the User has not seen in the News feed: those published
 * after the newest Post the feed last showed them or, if they have never opened it, within
 * the last {@link UNVISITED_LOOKBACK_DAYS} days. Posts without a publication instant never
 * count.
 */
export async function countUnreadPosts(userId: string): Promise<number> {
  const lastSeenAt = db
    .select({ lastSeenAt: newsFeedReadState.lastSeenAt })
    .from(newsFeedReadState)
    .where(eq(newsFeedReadState.userId, userId))

  const [row] = await db
    .select({ unread: count() })
    .from(post)
    .where(
      and(
        isNotNull(post.publishedAt),
        gt(post.publishedAt, sql`coalesce((${lastSeenAt}), now() - make_interval(days => ${UNVISITED_LOOKBACK_DAYS}))`)
      )
    )

  return row?.unread ?? 0
}

/**
 * Records that the News feed has shown the User every Post up to and including `postId`,
 * the newest one it rendered. The stamp is that Post's publication instant rather than the
 * time of the call, so a Post published while the feed was loading still counts as unread.
 *
 * Only moves forward, and ignores ids that are not published Posts. Returns whether the
 * stamp changed, so a caller can skip refreshing a badge that already reads zero.
 */
export async function markNewsFeedSeen(userId: string, postId: string): Promise<boolean> {
  if (!postIdSchema.safeParse(postId).success) return false

  const [seen] = await db
    .select({ publishedAt: post.publishedAt })
    .from(post)
    .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
    .limit(1)
  if (!seen?.publishedAt) return false

  const stamped = await db
    .insert(newsFeedReadState)
    .values({ userId, lastSeenAt: seen.publishedAt })
    .onConflictDoUpdate({
      target: newsFeedReadState.userId,
      set: { lastSeenAt: seen.publishedAt },
      setWhere: lt(newsFeedReadState.lastSeenAt, seen.publishedAt)
    })
    .returning({ userId: newsFeedReadState.userId })

  return stamped.length > 0
}
