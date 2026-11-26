import "server-only"

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm"
import type { PostAddress, PostAudienceTarget } from "@/core/authz/model"
import { samePostTargets } from "@/core/authz/post-audience"
import { db } from "@/core/db"
import { post, postTarget } from "@/core/db/schema/posts"
import type { RichTextDocument } from "@/features/rich-text"
import { queuePostRefresh } from "./refresh"
import { isPostId, type PostsDatabase } from "./service"

/** Validated content with its publisher and audience, which never default to all of CSK. */
export type PostContent = { title: string; body: RichTextDocument } & PostAddress
type SavedPost = { id: string }

const publicationColumns = {
  id: post.id,
  authorId: post.authorId,
  publisherGroupId: post.publisherGroupId,
  firstPublishedAt: post.firstPublishedAt,
  publishedAt: post.publishedAt,
  discardedAt: post.discardedAt,
  audienceAll: post.audienceAll
}

function findPublicationForUpdate(tx: PostsDatabase, id: string) {
  return tx
    .select(publicationColumns)
    .from(post)
    .where(and(eq(post.id, id), isNotNull(post.publishedAt), isNull(post.discardedAt)))
    .for("update")
}

function readTargets(tx: PostsDatabase, id: string) {
  return tx
    .select({ groupId: postTarget.groupId, voiceFamily: postTarget.voiceFamily })
    .from(postTarget)
    .where(eq(postTarget.postId, id))
}

async function replaceTargets(database: PostsDatabase, postId: string, targets: PostAudienceTarget[]) {
  await database.delete(postTarget).where(eq(postTarget.postId, postId))
  if (targets.length) await database.insert(postTarget).values(targets.map((target) => ({ postId, ...target })))
}

/** Persistence only: callers authorize and lock organisational facts in the enclosing transaction. */
export async function createPost(
  input: { authorId: string; content: PostContent; publish: boolean },
  database: PostsDatabase = db
): Promise<SavedPost> {
  return database.transaction(async (tx) => {
    const { targets, title, body, publisherGroupId, audienceAll } = input.content
    const content = { title, body, publisherGroupId, audienceAll }
    const now = input.publish ? new Date() : null
    const [created] = await tx
      .insert(post)
      .values({ ...content, authorId: input.authorId, publishedAt: now, firstPublishedAt: now })
      .returning(publicationColumns)
    if (!created) throw new Error("The post insert returned no row.")
    await replaceTargets(tx, created.id, targets)
    if (input.publish) await queuePostRefresh(tx, { post: created, targets })
    return { id: created.id }
  })
}

async function saveContent(
  input: { postId: string; actorId: string; content: PostContent; publish: boolean; draft: boolean },
  database: PostsDatabase
): Promise<SavedPost | null> {
  if (!isPostId(input.postId)) return null
  return database.transaction(async (tx) => {
    const { targets, title, body, publisherGroupId, audienceAll } = input.content
    const content = { title, body, publisherGroupId, audienceAll }
    const [previous] = input.draft ? [] : await findPublicationForUpdate(tx, input.postId)
    if (!input.draft && !previous) return null
    const oldTargets = await readTargets(tx, input.postId)
    const audienceChanged = !samePostTargets(oldTargets, targets)
    const changed = sql`(${post.title} is distinct from ${content.title} or ${post.body} is distinct from ${JSON.stringify(content.body)}::jsonb
      or ${audienceChanged} or ${post.audienceAll} is distinct from ${content.audienceAll})`
    const edited = sql`${changed} and (${post.publishedAt} is not null or (${post.publisherGroupId} is not null and ${post.firstPublishedAt} is not null))`
    const groupEdit = sql`${post.publisherGroupId} is not null and ${edited}`
    const state = input.draft
      ? and(
          isNull(post.publishedAt),
          or(eq(post.authorId, input.actorId), and(isNotNull(post.firstPublishedAt), isNotNull(post.publisherGroupId)))
        )
      : isNotNull(post.publishedAt)
    const [saved] = await tx
      .update(post)
      .set({
        ...content,
        editedAt: sql`case when ${edited} then now() else ${post.editedAt} end`,
        lastEditorId: sql`case when ${groupEdit} then ${input.actorId} else ${post.lastEditorId} end`,
        lastEditorRecorded: sql`case when ${groupEdit} then true else ${post.lastEditorRecorded} end`,
        revision: sql`${post.revision} + 1`,
        ...(input.publish
          ? { publishedAt: new Date(), firstPublishedAt: sql`coalesce(${post.firstPublishedAt}, now())` }
          : {})
      })
      .where(and(eq(post.id, input.postId), isNull(post.discardedAt), state))
      .returning(publicationColumns)
    if (!saved) return null
    await replaceTargets(tx, saved.id, targets)
    if (previous) await queuePostRefresh(tx, { post: previous, targets: oldTargets }, { post: saved, targets })
    else if (input.publish) await queuePostRefresh(tx, { post: saved, targets })
    return { id: saved.id }
  })
}

/** Save an authorized private Draft or shared Recalled Group Post, optionally publishing it. */
export async function saveDraft(
  input: { postId: string; authorId: string; content: PostContent; publish: boolean },
  database: PostsDatabase = db
): Promise<SavedPost | null> {
  return saveContent({ ...input, actorId: input.authorId, draft: true }, database)
}

/** Preserve original authorship and record the acting editor for meaningful Group Post edits. */
export async function editPublishedPost(
  input: { postId: string; content: PostContent; actorId: string },
  database: PostsDatabase = db
): Promise<SavedPost | null> {
  return saveContent({ ...input, draft: false, publish: false }, database)
}

/** Recall into a private Draft or a shared Recalled Group Post with its editor history. */
export async function unpublishPost(
  postId: string,
  database: PostsDatabase = db
): Promise<{ authorId: string | null; publisherGroupId: string | null } | null> {
  if (!isPostId(postId)) return null
  return database.transaction(async (tx) => {
    const [previous] = await findPublicationForUpdate(tx, postId)
    if (!previous) return null
    const [recalled] = await tx
      .update(post)
      .set({
        publishedAt: null,
        firstPublishedAt: sql`coalesce(${post.firstPublishedAt}, ${post.publishedAt})`,
        editedAt: sql`case when ${post.publisherGroupId} is not null then ${post.editedAt} end`,
        revision: sql`${post.revision} + 1`
      })
      .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
      .returning({ authorId: post.authorId, publisherGroupId: post.publisherGroupId })
    if (recalled) await queuePostRefresh(tx, { post: previous, targets: await readTargets(tx, postId) })
    return recalled ?? null
  })
}

/** Discard the author's private Draft. The row remains hidden from application views. */
export async function discardDraft(
  input: { postId: string; authorId: string },
  database: PostsDatabase = db
): Promise<boolean> {
  if (!isPostId(input.postId)) return false
  const discarded = await database
    .update(post)
    .set({ discardedAt: new Date(), revision: sql`${post.revision} + 1` })
    .where(
      and(
        eq(post.id, input.postId),
        isNull(post.publishedAt),
        isNull(post.discardedAt),
        eq(post.authorId, input.authorId),
        or(isNull(post.publisherGroupId), isNull(post.firstPublishedAt))
      )
    )
    .returning({ id: post.id })
  return discarded.length > 0
}
