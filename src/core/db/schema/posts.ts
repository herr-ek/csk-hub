import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const post = pgTable(
  "post",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    // Plain text, written in a textarea and shown as written. A richer format is a
    // later decision; nothing here presumes one.
    body: text("body").notNull(),
    // Erasing a Member takes their Posts with them, like every other record
    // hanging off `user`.
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
