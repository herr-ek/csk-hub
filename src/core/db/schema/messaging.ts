import { relations, sql } from "drizzle-orm"
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    title: text("title"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, { onDelete: "set null" })
  },
  (table) => [check("conversation_kind_check", sql`${table.kind} IN ('direct', 'group')`)]
)

export const directConversation = pgTable(
  "direct_conversation",
  {
    conversationId: uuid("conversation_id")
      .primaryKey()
      .references(() => conversation.id, { onDelete: "cascade" }),
    firstMemberId: text("first_member_id").references(() => user.id, { onDelete: "set null" }),
    secondMemberId: text("second_member_id").references(() => user.id, { onDelete: "set null" })
  },
  (table) => [
    uniqueIndex("directConversation_member_pair_unique").on(table.firstMemberId, table.secondMemberId),
    check(
      "directConversation_member_pair_order_check",
      sql`${table.firstMemberId} IS NULL OR ${table.secondMemberId} IS NULL OR ${table.firstMemberId} < ${table.secondMemberId}`
    )
  ]
)

export const conversationMembership = pgTable(
  "conversation_membership",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    historyVisibleFromSequence: integer("history_visible_from_sequence").default(1).notNull(),
    lastReadSequence: integer("last_read_sequence").default(0).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index("conversationMembership_userId_idx").on(table.userId),
    check("conversationMembership_history_visible_from_sequence_check", sql`${table.historyVisibleFromSequence} >= 1`),
    check("conversationMembership_last_read_sequence_check", sql`${table.lastReadSequence} >= 0`)
  ]
)

export const message = pgTable(
  "message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("message_conversation_sequence_unique").on(table.conversationId, table.sequence),
    uniqueIndex("message_author_idempotency_key_unique").on(table.authorUserId, table.idempotencyKey),
    index("message_conversation_sequence_idx").on(table.conversationId, table.sequence),
    check("message_sequence_check", sql`${table.sequence} > 0`)
  ]
)

export const conversationRelations = relations(conversation, ({ many, one }) => ({
  createdBy: one(user, {
    fields: [conversation.createdByUserId],
    references: [user.id],
    relationName: "conversationCreator"
  }),
  archivedBy: one(user, {
    fields: [conversation.archivedByUserId],
    references: [user.id],
    relationName: "conversationArchiver"
  }),
  directConversation: one(directConversation),
  memberships: many(conversationMembership),
  messages: many(message)
}))

export const directConversationRelations = relations(directConversation, ({ one }) => ({
  conversation: one(conversation, {
    fields: [directConversation.conversationId],
    references: [conversation.id]
  }),
  firstMember: one(user, {
    fields: [directConversation.firstMemberId],
    references: [user.id],
    relationName: "directConversationFirstMember"
  }),
  secondMember: one(user, {
    fields: [directConversation.secondMemberId],
    references: [user.id],
    relationName: "directConversationSecondMember"
  })
}))

export const conversationMembershipRelations = relations(conversationMembership, ({ one }) => ({
  conversation: one(conversation, {
    fields: [conversationMembership.conversationId],
    references: [conversation.id]
  }),
  member: one(user, {
    fields: [conversationMembership.userId],
    references: [user.id],
    relationName: "conversationMember"
  })
}))

export const messageRelations = relations(message, ({ one }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id]
  }),
  author: one(user, {
    fields: [message.authorUserId],
    references: [user.id],
    relationName: "messageAuthor"
  })
}))
