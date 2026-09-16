import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const post = pgTable(
  "post",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    // Markdown, not the editor's document JSON and not HTML (ADR-0004).
    body: text("body").notNull(),
    // Every insert sets it, so null means the author was erased, not that nobody wrote it.
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    // Null until published; drafts are a later issue's job.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  (table) => [index("post_published_at_idx").on(table.publishedAt.desc())]
)
