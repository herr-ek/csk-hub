import "server-only"

import { and, desc, eq, isNotNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"

export type NewsFeedEntry = {
  id: string
  title: string
  /** Null once the author has been erased; the Post itself survives them. */
  authorName: string | null
  publishedAt: Date
}

export type PublishedPost = NewsFeedEntry & { body: string }

const postIdSchema = z.uuid()

/** The whole feed, newest first. Every signed-in Member sees the same one. */
export async function listNewsFeed(): Promise<NewsFeedEntry[]> {
  const rows = await db
    .select({
      id: post.id,
      title: post.title,
      authorName: user.name,
      publishedAt: post.publishedAt
    })
    .from(post)
    // Left, not inner: an erased author leaves `author_id` null, and the Post still belongs
    // in the feed.
    .leftJoin(user, eq(post.authorId, user.id))
    .where(isNotNull(post.publishedAt))
    .orderBy(desc(post.publishedAt))

  return rows.flatMap((row) => (row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : []))
}

/** One Post by its opaque id, or null when it does not exist or is not published. */
export async function getPublishedPost(postId: string): Promise<PublishedPost | null> {
  if (!postIdSchema.safeParse(postId).success) return null

  const [row] = await db
    .select({
      id: post.id,
      title: post.title,
      body: post.body,
      authorName: user.name,
      publishedAt: post.publishedAt
    })
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
    .limit(1)

  return row?.publishedAt ? { ...row, publishedAt: row.publishedAt } : null
}
