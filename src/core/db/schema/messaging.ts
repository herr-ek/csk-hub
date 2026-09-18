import { relations, sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { user } from "./auth"

export const conversationKind = pgEnum("conversation_kind", ["direct", "group"])

export const conversation = pgTable("conversation", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: conversationKind("kind").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Allocated while the conversation row is locked so message sequences remain contiguous.
  nextMessageSequence: integer("next_message_sequence").default(1).notNull()
})

export const directConversation = pgTable(
  "direct_conversation",
  {
    conversationId: uuid("conversation_id")
      .primaryKey()
      .references(() => conversation.id, { onDelete: "cascade" }),
    firstMemberId: text("first_member_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    secondMemberId: text("second_member_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" })
  },
  (table) => [
    uniqueIndex("directConversation_member_pair_unique").on(table.firstMemberId, table.secondMemberId),
    check("directConversation_member_pair_order_check", sql`${table.firstMemberId} < ${table.secondMemberId}`)
  ]
)

export const groupConversation = pgTable(
  "group_conversation",
  {
    conversationId: uuid("conversation_id")
      .primaryKey()
      .references(() => conversation.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [check("groupConversation_name_not_blank_check", sql`length(btrim(${table.name})) > 0`)]
)

export const groupMembership = pgTable(
  "group_membership",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => groupConversation.conversationId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    // Null while active; the sequence visible after a member leaves.
    historyVisibleThroughSequence: integer("history_visible_through_sequence")
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index("groupMembership_userId_idx").on(table.userId),
    check(
      "groupMembership_departure_visibility_check",
      sql`(${table.leftAt} IS NULL) = (${table.historyVisibleThroughSequence} IS NULL)`
    ),
    check(
      "groupMembership_history_visible_through_sequence_check",
      sql`${table.historyVisibleThroughSequence} IS NULL OR ${table.historyVisibleThroughSequence} >= 0`
    )
  ]
)

export const conversationReadState = pgTable(
  // One cursor per user and conversation; authorization belongs to the conversation kind's membership model.
  "conversation_read_state",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadSequence: integer("last_read_sequence").default(0).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    check("conversationReadState_last_read_sequence_check", sql`${table.lastReadSequence} >= 0`)
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
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("message_conversation_sequence_unique").on(table.conversationId, table.sequence),
    uniqueIndex("message_author_idempotency_key_unique").on(table.authorUserId, table.idempotencyKey),
    index("message_conversation_sent_at_idx").on(table.conversationId, table.sentAt),
    check("message_sequence_check", sql`${table.sequence} > 0`),
    check("message_text_not_blank_check", sql`length(btrim(${table.text})) > 0`)
  ]
)

export const conversationRelations = relations(conversation, ({ many, one }) => ({
  directConversation: one(directConversation),
  groupConversation: one(groupConversation),
  groupMemberships: many(groupMembership),
  readStates: many(conversationReadState),
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

export const groupConversationRelations = relations(groupConversation, ({ one }) => ({
  conversation: one(conversation, {
    fields: [groupConversation.conversationId],
    references: [conversation.id]
  }),
  createdBy: one(user, {
    fields: [groupConversation.createdByUserId],
    references: [user.id],
    relationName: "groupConversationCreator"
  })
}))

export const groupMembershipRelations = relations(groupMembership, ({ one }) => ({
  conversation: one(conversation, {
    fields: [groupMembership.conversationId],
    references: [conversation.id]
  }),
  member: one(user, {
    fields: [groupMembership.userId],
    references: [user.id],
    relationName: "conversationMember"
  })
}))

export const conversationReadStateRelations = relations(conversationReadState, ({ one }) => ({
  conversation: one(conversation, {
    fields: [conversationReadState.conversationId],
    references: [conversation.id]
  }),
  user: one(user, {
    fields: [conversationReadState.userId],
    references: [user.id],
    relationName: "conversationReadStateUser"
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
