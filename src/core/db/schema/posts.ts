import type { JSONContent } from "@tiptap/core"
import { sql } from "drizzle-orm"
import { customType, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

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
    // words are stored once, and the index cannot fall out of step with them.
    bodySearch: tsvector("body_search").generatedAlwaysAs(
      sql`to_tsvector('swedish', coalesce(post_body_text("body"), ''))`
    ),
    // A Post outlives its author. Erasing a User drops the attribution and leaves the
    // announcement standing: the News feed is the record of what the choir was told, not
    // part of the erased User's own history. Null therefore means "author erased", not
    // "not written by anyone" — every insert sets it.
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    // Null until published; drafts are a later issue's job. Stored with a zone so
    // a Post keeps the same publication instant whatever the server runs in.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  (table) => [
    index("post_published_at_idx").on(table.publishedAt.desc()),
    index("post_body_search_idx").using("gin", table.bodySearch)
  ]
)
