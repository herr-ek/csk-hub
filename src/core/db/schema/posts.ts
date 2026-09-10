import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const post = pgTable(
  "post",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    // Markdown, not the editor's document JSON and not HTML (ADR-0004). The column
    // stays legible and searchable on its own, and outlives whichever editor wrote it.
    body: text("body").notNull(),
    // A Post outlives its author. Erasing a Member drops the attribution and leaves the
    // announcement standing: the News feed is the record of what the choir was told, not
    // part of the erased Member's own history. Null therefore means "author erased", not
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
  (table) => [index("post_published_at_idx").on(table.publishedAt.desc())]
)
