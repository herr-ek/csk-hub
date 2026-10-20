import "server-only"

import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"
import type { RichTextDocument } from "@/features/rich-text"

/** The application database client. Tests hand the reads and writes a throwaway one. */
export type PostsDatabase = typeof db

export type NewsFeedEntry = {
  id: string
  title: string
  /** Null once the author has been erased; the Post itself survives them. */
  authorName: string | null
  publishedAt: Date
  /** When the title or body last changed after publishing; null if they have not. */
  editedAt: Date | null
  /** The feed renders this too, so a reader sees what a Post says before opening it. */
  body: RichTextDocument
}

/** A Post read on its own page. The feed carries the same fields, so this is that type. */
export type PublishedPost = NewsFeedEntry

/** One of an author's drafts, as their list of drafts shows it. */
export type DraftSummary = { id: string; title: string; savedAt: Date }

/** A Post as the edit page loads it: a draft of the reader's own, or a published Post. */
export type EditablePost = {
  id: string
  title: string
  body: RichTextDocument
  state: "draft" | "published"
  savedAt: Date
}

const postIdSchema = z.uuid()

/** Whether `value` could name a Post. Ids arrive from URLs and forms, so anything may. */
export function isPostId(value: string): boolean {
  return postIdSchema.safeParse(value).success
}

const publishedPostColumns = {
  id: post.id,
  title: post.title,
  body: post.body,
  authorName: user.name,
  publishedAt: post.publishedAt,
  editedAt: post.editedAt
}

/** The whole feed, newest first. Every signed-in User sees the same one, and no drafts. */
export async function listNewsFeed(database: PostsDatabase = db): Promise<NewsFeedEntry[]> {
  const rows = await database
    .select(publishedPostColumns)
    .from(post)
    // Left, not inner: an erased author leaves `author_id` null, and the Post still belongs
    // in the feed.
    .leftJoin(user, eq(post.authorId, user.id))
    .where(isNotNull(post.publishedAt))
    .orderBy(desc(post.publishedAt))

  return rows.flatMap((row) => (row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : []))
}

/** One Post by its opaque id, or null when it does not exist or is not published. */
export async function getPublishedPost(postId: string, database: PostsDatabase = db): Promise<PublishedPost | null> {
  if (!isPostId(postId)) return null

  const [row] = await database
    .select(publishedPostColumns)
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
    .limit(1)

  return row?.publishedAt ? { ...row, publishedAt: row.publishedAt } : null
}

/** The author's own drafts, most recently saved first. Nobody else's, and none they discarded. */
export async function listDraftsByAuthor(authorId: string, database: PostsDatabase = db): Promise<DraftSummary[]> {
  return database
    .select({ id: post.id, title: post.title, savedAt: post.updatedAt })
    .from(post)
    .where(and(eq(post.authorId, authorId), isNull(post.publishedAt), isNull(post.discardedAt)))
    .orderBy(desc(post.updatedAt))
}

/**
 * The Post `readerId` may open for editing: any published Post, or a draft they wrote.
 * Another author's draft, or a discarded one, reads as missing, exactly like a Post that
 * does not exist. Whether
 * the reader may then change it is a permission, which the caller checks for the state.
 */
export async function getEditablePost(
  postId: string,
  readerId: string,
  database: PostsDatabase = db
): Promise<EditablePost | null> {
  if (!isPostId(postId)) return null

  const [row] = await database
    .select({ id: post.id, title: post.title, body: post.body, publishedAt: post.publishedAt, savedAt: post.updatedAt })
    .from(post)
    .where(
      and(
        eq(post.id, postId),
        or(isNotNull(post.publishedAt), and(eq(post.authorId, readerId), isNull(post.discardedAt)))
      )
    )
    .limit(1)

  if (!row) return null
  const { publishedAt, ...editable } = row
  return { ...editable, state: publishedAt ? "published" : "draft" }
}
