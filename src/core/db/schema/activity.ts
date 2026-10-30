import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type { ActivityChange } from "@/core/realtime/events"
import { user } from "./auth"

/** Durable per-User outbox and notification state. Redis only carries these record IDs. */
export const activityDelivery = pgTable(
  "activity_delivery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    change: jsonb("change").$type<ActivityChange>().notNull(),
    body: text("body"),
    title: text("title"),
    href: text("href"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishAfter: timestamp("publish_after", { withTimezone: true }).defaultNow().notNull(),
    pushAfter: timestamp("push_after", { withTimezone: true }),
    pushCompletedAt: timestamp("push_completed_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token")
  },
  (table) => [
    index("activity_user_created_idx").on(table.userId, table.createdAt),
    index("activity_publish_pending_idx").on(table.publishedAt, table.publishAfter),
    index("activity_push_pending_idx").on(table.pushCompletedAt, table.pushAfter)
  ]
)
