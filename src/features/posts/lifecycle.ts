import "server-only"

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm"
import type { PostAddress, PostAudienceTarget } from "@/core/authz/model"
import { samePostTargets } from "@/core/authz/post-audience"
import { db } from "@/core/db"
import { post, postTarget } from "@/core/db/schema/posts"
import { queuePublicActivity } from "@/core/realtime/outbox"
import type { RichTextDocument } from "@/features/rich-text"
import { isPostId, type PostsDatabase } from "./service"

/** Validated content. Production commands supply an explicit address; legacy callers retain all-CSK. */
export type PostContent = { title: string; body: RichTextDocument } & Partial<PostAddress>
type SavedPost = { id: string }

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
    const { targets = [], title, body, publisherGroupId = null, audienceAll = true } = input.content
    const content = { title, body, publisherGroupId, audienceAll }
    const now = input.publish ? new Date() : null
    const [created] = await tx
      .insert(post)
      .values({ ...content, authorId: input.authorId, publishedAt: now, firstPublishedAt: now })
      .returning({ id: post.id })
    if (!created) throw new Error("The post insert returned no row.")
    await replaceTargets(tx, created.id, targets)
    if (input.publish) await queuePublicActivity(tx, { kind: "posts.changed" })
    return created
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
    const oldTargets =
      targets === undefined
        ? []
        : await tx
            .select({ groupId: postTarget.groupId, voiceFamily: postTarget.voiceFamily })
            .from(postTarget)
            .where(eq(postTarget.postId, input.postId))
    const audienceChanged = targets !== undefined && !samePostTargets(oldTargets, targets)
    const changed = sql`(${post.title} is distinct from ${content.title} or ${post.body} is distinct from ${JSON.stringify(content.body)}::jsonb
      or ${audienceChanged} or ${post.audienceAll} is distinct from ${content.audienceAll ?? sql`${post.audienceAll}`})`
    const edited = sql`(${post.firstPublishedAt} is not null or ${post.publishedAt} is not null) and ${changed}`
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
        lastEditorId: sql`case when ${edited} then ${input.actorId} else ${post.lastEditorId} end`,
        lastEditorRecorded: sql`case when ${edited} then true else ${post.lastEditorRecorded} end`,
        revision: sql`${post.revision} + 1`,
        ...(input.publish
          ? { publishedAt: new Date(), firstPublishedAt: sql`coalesce(${post.firstPublishedAt}, now())` }
          : {})
      })
      .where(and(eq(post.id, input.postId), isNull(post.discardedAt), state))
      .returning({ id: post.id })
    if (!saved) return null
    if (targets !== undefined) await replaceTargets(tx, saved.id, targets)
    if (input.publish || !input.draft) await queuePublicActivity(tx, { kind: "posts.changed" })
    return saved
  })
}

/** Save an authorized private Draft or shared Recalled Group Post, optionally publishing it. */
export async function saveDraft(
  input: { postId: string; authorId: string; content: PostContent; publish: boolean },
  database: PostsDatabase = db
): Promise<SavedPost | null> {
  return saveContent({ ...input, actorId: input.authorId, draft: true }, database)
}

/** Preserve original authorship, tracking meaningful edits against the actual acting Member. */
export async function editPublishedPost(
  input: { postId: string; content: PostContent; actorId: string },
  database: PostsDatabase = db
): Promise<SavedPost | null> {
  return saveContent({ ...input, draft: false, publish: false }, database)
}

/** Recall without clearing publication history or editor attribution. Group content remains shared. */
export async function unpublishPost(
  postId: string,
  database: PostsDatabase = db
): Promise<{ authorId: string | null; publisherGroupId: string | null } | null> {
  if (!isPostId(postId)) return null
  return database.transaction(async (tx) => {
    const [recalled] = await tx
      .update(post)
      .set({
        publishedAt: null,
        firstPublishedAt: sql`coalesce(${post.firstPublishedAt}, ${post.publishedAt})`,
        revision: sql`${post.revision} + 1`
      })
      .where(and(eq(post.id, postId), isNotNull(post.publishedAt)))
      .returning({ authorId: post.authorId, publisherGroupId: post.publisherGroupId })
    if (recalled) await queuePublicActivity(tx, { kind: "posts.changed" })
    return recalled ?? null
  })
}

/** Discard authorized unpublished content. Rows survive, but no application view exposes them. */
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
        or(eq(post.authorId, input.authorId), and(isNotNull(post.firstPublishedAt), isNotNull(post.publisherGroupId)))
      )
    )
    .returning({ id: post.id })
  return discarded.length > 0
}
