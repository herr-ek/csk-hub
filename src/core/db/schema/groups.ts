import { relations, sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { user } from "./auth"

// Every write to these tables goes through `src/features/groups`, which enforces the rules the
// database cannot express. See CONTEXT.md#groups for the language.

export const groupType = pgEnum("group_type", [
  "Choir",
  "Section",
  "Board",
  "Committee",
  "GigGroup",
  "Gigmästeri",
  "Sexmästeri",
  "Rodd",
  "Fest",
  "Rephelg",
  "Konsert"
])

export const part = pgEnum("part", ["S", "A", "T", "B"])

export const voice = pgEnum("voice", ["S1", "S2", "A1", "A2", "T1", "T2", "B1", "B2"])

export const group = pgTable(
  "group",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: groupType("type").notNull(),
    // Null means CSK-wide. A Choir group itself is always CSK-wide.
    choirId: uuid("choir_id").references((): AnyPgColumn => choir.groupId, { onDelete: "restrict" }),
    active: boolean("active").default(true).notNull()
  },
  (table) => [
    // The migration adds NULLS NOT DISTINCT, which Drizzle's index builder cannot express, so two
    // active CSK-wide groups cannot share a name while each Choir keeps its own namespace.
    uniqueIndex("group_name_choir_active_unique").on(table.name, table.choirId).where(sql`${table.active}`),
    index("group_choirId_idx").on(table.choirId),
    check("group_name_not_blank_check", sql`length(btrim(${table.name})) > 0`)
  ]
)

/** A 1:1 extension of a Choir group. */
export const choir = pgTable("choir", {
  groupId: uuid("group_id")
    .primaryKey()
    .references((): AnyPgColumn => group.id, { onDelete: "restrict" })
})

export const sectionVoice = pgTable(
  "section_voice",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" }),
    voice: voice("voice").notNull()
  },
  (table) => [primaryKey({ columns: [table.sectionId, table.voice] })]
)

export const groupMember = pgTable(
  "group_member",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    // Null while the Membership is current.
    endDate: date("end_date"),
    // Set only on Section Memberships; MATCH SIMPLE leaves the composite key unchecked when null.
    voice: voice("voice")
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.groupId, table.startDate] }),
    foreignKey({
      name: "group_member_section_voice_fk",
      columns: [table.groupId, table.voice],
      foreignColumns: [sectionVoice.sectionId, sectionVoice.voice]
    }).onDelete("restrict"),
    uniqueIndex("group_member_current_unique").on(table.userId, table.groupId).where(sql`${table.endDate} IS NULL`),
    index("group_member_groupId_idx").on(table.groupId),
    check("group_member_period_check", sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`)
  ]
)

export const position = pgTable(
  "position",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull()
  },
  (table) => [
    uniqueIndex("position_name_unique").on(table.name),
    check("position_name_not_blank_check", sql`length(btrim(${table.name})) > 0`)
  ]
)

/** Which Positions may be held in which GroupType. */
export const groupTypePosition = pgTable(
  "group_type_position",
  {
    type: groupType("type").notNull(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "restrict" })
  },
  (table) => [primaryKey({ columns: [table.type, table.positionId] })]
)

export const positionHolder = pgTable(
  "position_holder",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    // Null while the holding is current.
    endDate: date("end_date")
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.groupId, table.positionId, table.startDate] }),
    uniqueIndex("position_holder_current_unique")
      .on(table.groupId, table.positionId)
      .where(sql`${table.endDate} IS NULL`),
    index("position_holder_userId_idx").on(table.userId),
    check("position_holder_period_check", sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`)
  ]
)

/** What a user can sing, independent of any Section Membership. */
export const voiceCapability = pgTable(
  "voice_capability",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    voice: voice("voice").notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.voice] })]
)

export const groupRelations = relations(group, ({ one, many }) => ({
  choir: one(choir, { fields: [group.choirId], references: [choir.groupId], relationName: "choirGroups" }),
  choirExtension: one(choir, { fields: [group.id], references: [choir.groupId], relationName: "choirExtension" }),
  sectionVoices: many(sectionVoice),
  members: many(groupMember),
  positionHolders: many(positionHolder)
}))

export const choirRelations = relations(choir, ({ one, many }) => ({
  group: one(group, { fields: [choir.groupId], references: [group.id], relationName: "choirExtension" }),
  groups: many(group, { relationName: "choirGroups" })
}))

export const sectionVoiceRelations = relations(sectionVoice, ({ one }) => ({
  section: one(group, { fields: [sectionVoice.sectionId], references: [group.id] })
}))

export const groupMemberRelations = relations(groupMember, ({ one }) => ({
  group: one(group, { fields: [groupMember.groupId], references: [group.id] }),
  member: one(user, { fields: [groupMember.userId], references: [user.id], relationName: "groupMember" })
}))

export const positionRelations = relations(position, ({ many }) => ({
  groupTypes: many(groupTypePosition),
  holders: many(positionHolder)
}))

export const groupTypePositionRelations = relations(groupTypePosition, ({ one }) => ({
  position: one(position, { fields: [groupTypePosition.positionId], references: [position.id] })
}))

export const positionHolderRelations = relations(positionHolder, ({ one }) => ({
  group: one(group, { fields: [positionHolder.groupId], references: [group.id] }),
  position: one(position, { fields: [positionHolder.positionId], references: [position.id] }),
  holder: one(user, { fields: [positionHolder.userId], references: [user.id], relationName: "positionHolder" })
}))

export const voiceCapabilityRelations = relations(voiceCapability, ({ one }) => ({
  user: one(user, { fields: [voiceCapability.userId], references: [user.id], relationName: "voiceCapability" })
}))
