import { relations } from "drizzle-orm"
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const pushSubscriptionStatus = pgEnum("push_subscription_status", ["active", "disabled"])

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    expirationTime: timestamp("expiration_time"),
    userAgent: text("user_agent"),
    deviceLabel: text("device_label"),
    status: pushSubscriptionStatus("status").default("active").notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    lastSuccessAt: timestamp("last_success_at"),
    lastFailureAt: timestamp("last_failure_at"),
    failureCount: integer("failure_count").default(0).notNull(),
    disabledAt: timestamp("disabled_at"),
    disabledReason: text("disabled_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    uniqueIndex("push_subscription_endpoint_idx").on(table.endpoint),
    index("push_subscription_user_status_idx").on(table.userId, table.status),
    index("push_subscription_status_seen_idx").on(table.status, table.lastSeenAt)
  ]
)

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, {
    fields: [pushSubscription.userId],
    references: [user.id]
  })
}))
