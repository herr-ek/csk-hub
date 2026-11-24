import "server-only"

import { and, desc, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm"
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

export const NEWS_FEED_PAGE_SIZE = 20

/**
 * The first `pages` pages of the feed, newest first. Every signed-in User sees the same one,
 * and no drafts. "Load more" asks for one page more, so the feed reads from the top each time.
 */
export function listNewsFeed(pages: number, database: PostsDatabase = db, authorize = requirePermission) {
  return readNewsFeed(pages, undefined, database, authorize)
}

/**
 * The published Posts whose title or body match `query`, paged and ordered like the feed.
 * The query is the reader's own words in web-search syntax, so it is bound, never spliced in.
 */
export function searchNewsFeed(
  query: string,
  pages: number,
  database: PostsDatabase = db,
  authorize = requirePermission
) {
  const terms = sql`websearch_to_tsquery('swedish', ${query})`
  // One vector for title and body, so a query's words may fall in either, and need no migration.
  // shortcut: this skips the `body_search` GIN index; fold the title into the generated column if the feed grows large.
  const matches = sql`(to_tsvector('swedish', ${post.title}) || ${post.bodySearch}) @@ ${terms}`
  return readNewsFeed(pages, matches, database, authorize)
}

async function readNewsFeed(
  pages: number,
  matches: SQL | undefined,
  database: PostsDatabase,
  authorize: typeof requirePermission
): Promise<{ entries: NewsFeedEntry[]; pages: number; hasMore: boolean }> {
  await authorize({ action: "app.access" }, database)
  // The count arrives from the URL, so anything may.
  const shown = Number.isSafeInteger(pages) && pages > 0 ? pages : 1
  const limit = shown * NEWS_FEED_PAGE_SIZE
  const rows = await database
    .select(publishedPostColumns)
    .from(post)
    // Left, not inner: an erased author leaves `author_id` null, and the Post still belongs
    // in the feed.
    .leftJoin(user, eq(post.authorId, user.id))
    .where(and(isNotNull(post.publishedAt), matches))
    // The id breaks ties, so a Post never shows twice or goes missing across pages.
    .orderBy(desc(post.publishedAt), desc(post.id))
    // One row past the budget tells whether there is more, without counting the table.
    .limit(limit + 1)

  const entries = rows.flatMap((row) => (row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : []))
  return { entries: entries.slice(0, limit), pages: shown, hasMore: entries.length > limit }
}

/** One Post as an overview lists it: what it is called and who published it when. */
export type LatestPost = Omit<NewsFeedEntry, "body">

/** The `count` newest published Posts, newest first, without their bodies. */
export async function listLatestPosts(
  count: number,
  database: PostsDatabase = db,
  authorize = requirePermission
): Promise<LatestPost[]> {
  await authorize({ action: "app.access" }, database)
  const { body: _body, ...columns } = publishedPostColumns
  const rows = await database
    .select(columns)
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(isNotNull(post.publishedAt))
    .orderBy(desc(post.publishedAt))
    .limit(count)

  return rows.flatMap((row) => (row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : []))
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
      const [row] = await tx
        .select({ ...publishedPostColumns, authorId: post.authorId, discardedAt: post.discardedAt })
        .from(post)
        .leftJoin(user, eq(post.authorId, user.id))
        .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
        .limit(1)
        .for("share", { of: post })

      await authorize({ action: "post.read", context: { post: row ?? null } }, tx)
      if (!row?.publishedAt) return null
      const { authorId: _authorId, discardedAt: _discardedAt, ...published } = row
      return { ...published, publishedAt: row.publishedAt }
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
  const { userId: authorId } = await authorize({ action: "app.access" }, database)
  return database
    .select({ id: post.id, title: post.title, savedAt: post.updatedAt })
    .from(post)
    .where(and(eq(post.authorId, authorId), isNull(post.publishedAt), isNull(post.discardedAt)))
    .orderBy(desc(post.updatedAt))
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
      const [row] = await tx
        .select({
          id: post.id,
          title: post.title,
          body: post.body,
          publishedAt: post.publishedAt,
          authorId: post.authorId,
          discardedAt: post.discardedAt,
          savedAt: post.updatedAt
        })
        .from(post)
        .where(and(eq(post.id, postId), isNull(post.discardedAt)))
        .limit(1)
        .for("share")

      await authorize({ action: "post.update", context: { post: row ?? null } }, tx)
      if (!row) return null
      const { publishedAt, authorId: _authorId, discardedAt: _discardedAt, ...editable } = row
      return { ...editable, state: publishedAt ? "published" : "draft" }
    })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  }
}
