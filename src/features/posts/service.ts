import "server-only"

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { z } from "zod"
import { type AuthorizationDatabase, AuthorizationDeniedError, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"
import type { RichTextDocument } from "@/features/rich-text"

/** The application database client. Tests hand the reads and writes a throwaway one. */
export type PostsDatabase = AuthorizationDatabase

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
export async function listNewsFeed(
  database: PostsDatabase = db,
  authorize = requirePermission
): Promise<NewsFeedEntry[]> {
  return database.transaction(async (tx) => {
    await authorize({ action: "app.access" }, tx)
    const rows = await tx
      .select(publishedPostColumns)
      .from(post)
      // Left, not inner: an erased author leaves `author_id` null, and the Post still belongs
      // in the feed.
      .leftJoin(user, eq(post.authorId, user.id))
      .where(isNotNull(post.publishedAt))
      .orderBy(desc(post.publishedAt))

    return rows.flatMap((row) => (row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : []))
  })
}

/** One Post by its opaque id, or null when it does not exist or is not published. */
export async function getPublishedPost(
  postId: string,
  database: PostsDatabase = db,
  authorize = requirePermission
): Promise<PublishedPost | null> {
  if (!isPostId(postId)) return null
  try {
    return await database.transaction(async (tx) => {
      await authorize({ action: "post.read", postId }, tx)
      const [row] = await tx
        .select(publishedPostColumns)
        .from(post)
        .leftJoin(user, eq(post.authorId, user.id))
        .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
        .limit(1)

      return row?.publishedAt ? { ...row, publishedAt: row.publishedAt } : null
    })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  }
}

/** The author's own drafts, most recently saved first. Nobody else's, and none they discarded. */
export async function listOwnDrafts(
  database: PostsDatabase = db,
  authorize = requirePermission
): Promise<DraftSummary[]> {
  return database.transaction(async (tx) => {
    const { userId: authorId } = await authorize({ action: "app.access" }, tx)
    return tx
      .select({ id: post.id, title: post.title, savedAt: post.updatedAt })
      .from(post)
      .where(and(eq(post.authorId, authorId), isNull(post.publishedAt), isNull(post.discardedAt)))
      .orderBy(desc(post.updatedAt))
  })
}

/**
 * The current actor's editable Post. The resource guard and content read share a transaction
 * and Post lock, so an intervening Unpublish cannot expose another author's private Draft.
 * Missing or forbidden Posts both return null.
 */
export async function getEditablePost(
  postId: string,
  database: PostsDatabase = db,
  authorize = requirePermission
): Promise<EditablePost | null> {
  if (!isPostId(postId)) return null

  try {
    return await database.transaction(async (tx) => {
      await authorize({ action: "post.update", postId }, tx)
      const [row] = await tx
        .select({
          id: post.id,
          title: post.title,
          body: post.body,
          publishedAt: post.publishedAt,
          savedAt: post.updatedAt
        })
        .from(post)
        .where(and(eq(post.id, postId), isNull(post.discardedAt)))
        .limit(1)

      if (!row) return null
      const { publishedAt, ...editable } = row
      return { ...editable, state: publishedAt ? "published" : "draft" }
    })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  }
}
