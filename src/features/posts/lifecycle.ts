import "server-only"

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "@/core/db"
import { post } from "@/core/db/schema/posts"
import type { RichTextDocument } from "@/features/rich-text"
import { isPostId, type PostsDatabase } from "./service"

/**
 * A Post is a draft while `publishedAt` is null and published once it is set. Drafts belong
 * to their author alone; a published Post belongs to the choir, so any Admin may change it.
 * Unpublishing is a recall: the Post becomes its author's draft again. Nothing deletes one;
 * an author who no longer wants a draft discards it, which hides it for good.
 *
 * Every command checks its starting state in the same statement that changes it, so a Post
 * that moved on in the meantime — published from another tab, recalled by another Admin —
 * is reported as missing rather than written in the wrong state.
 */

/** A Post's title and body, already checked against the Post's schema. */
export type PostContent = { title: string; body: RichTextDocument }

type SavedPost = { id: string }

/** The live draft `postId`, as long as `authorId` wrote it. */
function draftOf(postId: string, authorId: string) {
  return and(eq(post.id, postId), eq(post.authorId, authorId), isNull(post.publishedAt), isNull(post.discardedAt))
}

/** Writes a new Post for its author, either published at once or kept as their draft. */
export async function createPost(
  input: { authorId: string; content: PostContent; publish: boolean },
  database: PostsDatabase = db
): Promise<SavedPost> {
  const [created] = await database
    .insert(post)
    .values({
      ...input.content,
      authorId: input.authorId,
      publishedAt: input.publish ? new Date() : null
    })
    .returning({ id: post.id })

  if (!created) throw new Error("The post insert returned no row.")
  return created
}

/**
 * Saves the author's draft, and publishes it when asked. Null when the Post is not a
 * draft of theirs: someone else's, already published, discarded, or not there at all.
 */
export async function saveDraft(
  input: { postId: string; authorId: string; content: PostContent; publish: boolean },
  database: PostsDatabase = db
): Promise<SavedPost | null> {
  if (!isPostId(input.postId)) return null

  const [saved] = await database
    .update(post)
    .set({ ...input.content, ...(input.publish ? { publishedAt: new Date() } : {}) })
    .where(draftOf(input.postId, input.authorId))
    .returning({ id: post.id })

  return saved ?? null
}

/**
 * Changes a published Post in place, with immediate effect. It is marked edited only when
 * the title or body actually differ, so saving without a change does not tell readers the
 * Post moved. Null when the Post is not published.
 */
export async function editPublishedPost(
  input: { postId: string; content: PostContent },
  database: PostsDatabase = db
): Promise<SavedPost | null> {
  if (!isPostId(input.postId)) return null

  const { title, body } = input.content
  // The comparison reads the row as it was before this update; jsonb equality ignores key
  // order, so only a different document counts as an edit.
  const editedAt = sql`case
    when ${post.title} is distinct from ${title} or ${post.body} is distinct from ${JSON.stringify(body)}::jsonb
    then now() else ${post.editedAt} end`

  const [saved] = await database
    .update(post)
    .set({ title, body, editedAt })
    .where(and(eq(post.id, input.postId), isNotNull(post.publishedAt)))
    .returning({ id: post.id })

  return saved ?? null
}

/**
 * Recalls a published Post: it leaves the feed and its permalink and is its author's
 * draft again, so republishing dates it afresh and it carries no edited mark. False when
 * the Post is not published.
 */
export async function unpublishPost(postId: string, database: PostsDatabase = db): Promise<boolean> {
  if (!isPostId(postId)) return false

  const recalled = await database
    .update(post)
    .set({ publishedAt: null, editedAt: null })
    .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
    .returning({ id: post.id })

  return recalled.length > 0
}

/**
 * Throws the author's draft away: it leaves their drafts and cannot be opened, saved or
 * published again. The row stays, since Posts are never deleted. False when the Post is not
 * a live draft of theirs; a published Post is unpublished first.
 */
export async function discardDraft(
  input: { postId: string; authorId: string },
  database: PostsDatabase = db
): Promise<boolean> {
  if (!isPostId(input.postId)) return false

  const discarded = await database
    .update(post)
    .set({ discardedAt: new Date() })
    .where(draftOf(input.postId, input.authorId))
    .returning({ id: post.id })

  return discarded.length > 0
}
