import type { JSONContent } from "@tiptap/core"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { group } from "./org-structure"
import { voiceFamily } from "./voice"

/** Postgres's full-text type; Drizzle has no built-in for it. Read only, never written by the app. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  }
})

export const post = pgTable(
  "post",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    // The editor's own document, not Markdown and not HTML (ADR-0005). Which nodes it
    // may hold is the posts feature's decision, enforced before the row is written.
    body: jsonb("body").$type<JSONContent>().notNull(),
    // Lexemes for search, derived by Postgres from the text nodes in `body` — so the
    // words are stored once, and the index cannot fall out of step with them. Built-ins
    // only, so drizzle-kit can generate the column: the jsonpath picks out text nodes in
    // document order, and `to_tsvector` indexes the strings of the array it returns.
    bodySearch: tsvector("body_search").generatedAlwaysAs(
      sql`to_tsvector('swedish', jsonb_path_query_array("body", 'strict $.**.text')::text)`
    ),
    // A Post outlives its author. Erasing a User drops the attribution and leaves the
    // announcement standing: the News feed is the record of what the choir was told, not
    // part of the erased User's own history. Null therefore means "author erased", not
    // "not written by anyone" — every insert sets it.
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    publisherGroupId: uuid("publisher_group_id").references(() => group.id, { onDelete: "restrict" }),
    lastEditorId: text("last_editor_id").references(() => user.id, { onDelete: "set null" }),
    // Distinguish legacy edits with no recorded editor from a recorded editor later erased.
    lastEditorRecorded: boolean("last_editor_recorded").default(false).notNull(),
    // Preserved through recall: distinguishes shared recalled Group content from private Drafts.
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
    // Existing Posts addressed all CSK. New compose forms explicitly choose an audience.
    audienceAll: boolean("audience_all").default(true).notNull(),
    revision: integer("revision").default(0).notNull(),
    // Null for private Drafts and shared Recalled Group Posts. Unpublishing clears only
    // this current publication instant; firstPublishedAt preserves the publishing identity.
    // Stored with a zone so a Post keeps the same publication instant whatever the server
    // runs in.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // When title, body or audience last changed after first publication, shown beside the publish date
    // so a reader can tell the Post moved under them. Null for a Post untouched since
    // publishing; unlike `updatedAt`, private Draft saves and publication alone do not set it.
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // When the author threw the draft away. A discarded draft is gone from every view, but
    // the row stays: Posts are never deleted. Only a draft can be discarded.
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  (table) => [
    index("post_published_at_idx").on(table.publishedAt.desc()),
    index("post_body_search_idx").using("gin", table.bodySearch),
    // A published Post is the choir's record, so it is unpublished first, never discarded.
    check("post_discarded_draft_check", sql`${table.discardedAt} is null or ${table.publishedAt} is null`)
  ]
)

export const postTarget = pgTable(
  "post_target",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => group.id, { onDelete: "restrict" }),
    voiceFamily: voiceFamily("voice_family")
  },
  (table) => [
    unique("post_target_unique").on(table.postId, table.groupId, table.voiceFamily).nullsNotDistinct(),
    index("post_target_post_idx").on(table.postId),
    index("post_target_group_idx").on(table.groupId),
    check("post_target_not_empty_check", sql`${table.groupId} IS NOT NULL OR ${table.voiceFamily} IS NOT NULL`)
  ]
)

// That a User has opened a Post, which is what takes it off their unread badge. Private to
// that User: it answers "what is new to me", never "who has read this".
export const postRead = pgTable(
  "post_read",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    // The key leads with the User; deleting a Post looks its reads up by Post.
    index("post_read_post_id_idx").on(table.postId)
  ]
)
