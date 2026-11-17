import "server-only"

import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"
import {
  type AuthorizationDatabase,
  AuthorizationDeniedError,
  type RequestAuthorization,
  withCurrentRequest
} from "@/core/authz"
import type { PostAttributes, PostAudienceTarget, PostRelationships } from "@/core/authz/model"
import { matchesPostTarget } from "@/core/authz/post-audience"
import { canAddressPostGroup, canRepresentPostGroup } from "@/core/authz/post-policies"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { group } from "@/core/db/schema/org-structure"
import { post, postTarget } from "@/core/db/schema/posts"
import type { RichTextDocument } from "@/features/rich-text"
import { editableUnpublishedVisibility, getPostScope, publishedPostVisibility } from "./access"

export type PostsDatabase = AuthorizationDatabase
export type NewsFeedEntry = {
  id: string
  title: string
  authorName: string | null
  showAuthor: boolean
  audienceAll: boolean
  /** Only audience targets matched by the current reader; management alone adds no chip. */
  targets: { groupName: string | null; voiceFamily: PostAudienceTarget["voiceFamily"] }[]
  publisherName: string | null
  lastEditorName: string | null
  lastEditorRecorded: boolean
  publishedAt: Date
  editedAt: Date | null
  body: RichTextDocument
}
export type PublishedPost = NewsFeedEntry
export type DraftSummary = { id: string; title: string; savedAt: Date; recalled: boolean }
export type EditablePost = {
  id: string
  title: string
  body: RichTextDocument
  state: "draft" | "published"
  savedAt: Date
  publisherGroupId: string | null
  audienceAll: boolean
  targets: PostAudienceTarget[]
  revision: number
  identityFixed: boolean
  recalled: boolean
}
const postIdSchema = z.uuid()
export function isPostId(value: string): boolean {
  return postIdSchema.safeParse(value).success
}
const editor = alias(user, "post_editor")
const publishedPostColumns = {
  id: post.id,
  title: post.title,
  body: post.body,
  authorName: user.name,
  publisherName: group.name,
  lastEditorName: editor.name,
  lastEditorRecorded: post.lastEditorRecorded,
  publishedAt: post.publishedAt,
  editedAt: post.editedAt,
  authorId: post.authorId,
  publisherGroupId: post.publisherGroupId,
  firstPublishedAt: post.firstPublishedAt,
  discardedAt: post.discardedAt,
  audienceAll: post.audienceAll
}

type PublishedRow = PostAttributes &
  Omit<NewsFeedEntry, "showAuthor" | "targets" | "publishedAt" | "body"> & { publishedAt: Date | null }

/** Shape protected metadata only after the Posts and relationship facts have been locked. */
async function publishedReadModels<Row extends PublishedRow>(
  rows: Row[],
  database: PostsDatabase,
  access: RequestAuthorization,
  relationships: PostRelationships
) {
  if (rows.length === 0) return []
  const targets = await database
    .select({
      postId: postTarget.postId,
      groupId: postTarget.groupId,
      groupName: group.name,
      voiceFamily: postTarget.voiceFamily
    })
    .from(postTarget)
    .leftJoin(group, eq(postTarget.groupId, group.id))
    .where(
      inArray(
        postTarget.postId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(postTarget.id)
  return rows.flatMap((row) => {
    if (!row.publishedAt) return []
    const audience = targets.filter((target) => target.postId === row.id)
    const showAuthor = access.can({
      action: "post.readAttribution",
      context: { post: row, relationships, targets: audience }
    })
    const {
      authorId: _authorId,
      publisherGroupId: _publisherGroupId,
      firstPublishedAt: _firstPublishedAt,
      discardedAt: _discardedAt,
      ...visible
    } = row
    return [
      {
        ...visible,
        publishedAt: row.publishedAt,
        showAuthor,
        authorName: showAuthor ? row.authorName : null,
        lastEditorName: showAuthor ? row.lastEditorName : null,
        lastEditorRecorded: showAuthor && row.lastEditorRecorded,
        targets: audience
          .filter((target) => access.actor !== null && matchesPostTarget(access.actor, target, relationships))
          .map(({ groupName, voiceFamily }) => ({ groupName, voiceFamily }))
      }
    ]
  })
}

export const NEWS_FEED_PAGE_SIZE = 20

/**
 * The first `pages` pages of the Posts this reader can see, newest first, and no drafts.
 * "Load more" asks for one page more, so the feed reads from the top each time. Visibility is
 * filtered in SQL, before the limit, so Posts the reader cannot see take up no room on a page.
 */
export function listNewsFeed(pages: number, database: PostsDatabase = db, withAccess = withCurrentRequest) {
  return readNewsFeed(pages, undefined, database, withAccess)
}

/**
 * The published Posts whose title or body match `query`, paged and ordered like the feed.
 * The query is the reader's own words in web-search syntax, so it is bound, never spliced in.
 */
export function searchNewsFeed(
  query: string,
  pages: number,
  database: PostsDatabase = db,
  withAccess = withCurrentRequest
) {
  const terms = sql`websearch_to_tsquery('swedish', ${query})`
  // One vector for title and body, so a query's words may fall in either, and need no migration.
  // shortcut: this skips the `body_search` GIN index; fold the title into the generated column if the feed grows large.
  const matches = sql`(to_tsvector('swedish', ${post.title}) || ${post.bodySearch}) @@ ${terms}`
  return readNewsFeed(pages, matches, database, withAccess)
}

async function readNewsFeed(
  pages: number,
  matches: SQL | undefined,
  database: PostsDatabase,
  withAccess: typeof withCurrentRequest
): Promise<{ entries: NewsFeedEntry[]; pages: number; hasMore: boolean }> {
  // The count arrives from the URL, so anything may.
  const shown = Number.isSafeInteger(pages) && pages > 0 ? pages : 1
  const limit = shown * NEWS_FEED_PAGE_SIZE
  return withAccess(async (access, tx) => {
    const { actor, relationships } = await getPostScope(tx, access)
    const rows = await tx
      .select(publishedPostColumns)
      .from(post)
      .leftJoin(user, eq(post.authorId, user.id))
      .leftJoin(editor, eq(post.lastEditorId, editor.id))
      .leftJoin(group, eq(post.publisherGroupId, group.id))
      .where(and(publishedPostVisibility(tx, actor, relationships), matches))
      // The id breaks ties, so a Post never shows twice or goes missing across pages.
      .orderBy(desc(post.publishedAt), desc(post.id))
      // One row past the budget tells whether there is more, without counting the table.
      .limit(limit + 1)
      .for("share", { of: post })
    const entries = await publishedReadModels(rows.slice(0, limit), tx, access, relationships)
    return { entries, pages: shown, hasMore: rows.length > limit }
  }, database)
}

/** The newest visible Posts for the home overview, without their bodies. */
export async function listLatestPosts(
  count: number,
  database: PostsDatabase = db,
  withAccess = withCurrentRequest
): Promise<Omit<NewsFeedEntry, "body" | "targets">[]> {
  return withAccess(async (access, tx) => {
    const { actor, relationships } = await getPostScope(tx, access)
    const { body: _body, ...columns } = publishedPostColumns
    const rows = await tx
      .select(columns)
      .from(post)
      .leftJoin(user, eq(post.authorId, user.id))
      .leftJoin(editor, eq(post.lastEditorId, editor.id))
      .leftJoin(group, eq(post.publisherGroupId, group.id))
      .where(publishedPostVisibility(tx, actor, relationships))
      .orderBy(desc(post.publishedAt))
      .limit(count)
      .for("share", { of: post })
    const visible = await publishedReadModels(rows, tx, access, relationships)
    return visible.map(({ targets: _targets, ...row }) => row)
  }, database)
}

/** Missing and forbidden resources are indistinguishable; serialize with recall and audience edits. */
export async function getPublishedPost(
  postId: string,
  database: PostsDatabase = db,
  withAccess = withCurrentRequest
): Promise<PublishedPost | null> {
  if (!isPostId(postId)) return null
  try {
    return await withAccess(async (access, tx) => {
      const { actor, relationships } = await getPostScope(tx, access)
      const [row] = await tx
        .select(publishedPostColumns)
        .from(post)
        .leftJoin(user, eq(post.authorId, user.id))
        .leftJoin(editor, eq(post.lastEditorId, editor.id))
        .leftJoin(group, eq(post.publisherGroupId, group.id))
        .where(and(eq(post.id, postId), publishedPostVisibility(tx, actor, relationships)))
        .for("share", { of: post })
      return row ? ((await publishedReadModels([row], tx, access, relationships))[0] ?? null) : null
    }, database)
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  }
}

/** Private Drafts plus Recalled Group Posts currently managed by the actor. */
export async function listOwnDrafts(
  database: PostsDatabase = db,
  withAccess = withCurrentRequest
): Promise<DraftSummary[]> {
  return withAccess(async (access, tx) => {
    const { actor, relationships } = await getPostScope(tx, access)
    const rows = await tx
      .select({
        id: post.id,
        title: post.title,
        savedAt: post.updatedAt,
        firstPublishedAt: post.firstPublishedAt,
        publisherGroupId: post.publisherGroupId
      })
      .from(post)
      .where(editableUnpublishedVisibility(actor, relationships))
      .orderBy(desc(post.updatedAt))
      .for("share")
    return rows.map(({ firstPublishedAt, publisherGroupId, ...row }) => ({
      ...row,
      recalled: firstPublishedAt !== null && publisherGroupId !== null
    }))
  }, database)
}

/** Load complete trusted facts and establish editing authority in the same locked transaction. */
export async function getEditablePost(
  postId: string,
  database: PostsDatabase = db,
  withAccess = withCurrentRequest
): Promise<EditablePost | null> {
  if (!isPostId(postId)) return null
  try {
    return await withAccess(async (access, tx) => {
      const { relationships } = await getPostScope(tx, access)
      const [row] = await tx
        .select()
        .from(post)
        .where(and(eq(post.id, postId), isNull(post.discardedAt)))
        .for("share")
      access.requirePermission({ action: "post.update", context: { post: row ?? null, relationships } })
      if (!row) return null
      const targets = await tx
        .select({ groupId: postTarget.groupId, voiceFamily: postTarget.voiceFamily })
        .from(postTarget)
        .where(eq(postTarget.postId, postId))
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        savedAt: row.updatedAt,
        state: row.publishedAt ? "published" : "draft",
        publisherGroupId: row.publisherGroupId,
        audienceAll: row.audienceAll,
        targets,
        revision: row.revision,
        identityFixed: row.firstPublishedAt !== null || row.publishedAt !== null,
        recalled: row.firstPublishedAt !== null && row.publisherGroupId !== null && row.publishedAt === null
      }
    }, database)
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  }
}

/** Presentation options only: every write independently reloads and validates the selected facts. */
export async function getPostComposeOptions(database: PostsDatabase = db, withAccess = withCurrentRequest) {
  return withAccess(async (access, tx) => {
    const { actor, relationships } = await getPostScope(tx, access)
    const groups = await tx
      .select({ id: group.id, name: group.name, active: group.active })
      .from(group)
      .orderBy(group.name)
    const publishers = relationships.groups.filter((g) => canRepresentPostGroup(actor, g, relationships))
    const audiencesByPublisher: Record<string, string[]> = {}
    for (const publisher of [null, ...publishers]) {
      audiencesByPublisher[publisher?.id ?? ""] = relationships.groups
        .filter((target) => canAddressPostGroup(actor, target, publisher, relationships))
        .map((g) => g.id)
    }
    return { groups, publishers: groups.filter((g) => publishers.some((p) => p.id === g.id)), audiencesByPublisher }
  }, database)
}
export type PostComposeOptions = Awaited<ReturnType<typeof getPostComposeOptions>>
