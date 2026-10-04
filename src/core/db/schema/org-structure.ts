import { relations, sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { voice } from "./voice"

// Groups, their Memberships, and the Positions held in them: the organisation's structure. Every
// write to these tables goes through `src/features/org-structure`, which enforces the rules the
// database cannot express. See CONTEXT.md#groups for the language.
//
// Drizzle cannot express everything below, so `drizzle/0011_groups.sql` carries two additions
// written by hand for these tables, each marked "Hand-written in drizzle/0011_groups.sql" here and
// "Added by hand" there ((1), the voice domains, is described in `./voice.ts`):
//   2. NULLS NOT DISTINCT on `group_name_choir_active_unique`
//   3. the `group_member_voice_check` trigger and its function
// drizzle-kit neither generates nor diffs them. A regenerated migration loses them unless they are
// copied back, and changing one later takes a hand-written migration.

export const groupType = pgEnum("group_type", [
  "Choir",
  "Section",
  "Board",
  "GigGroup",
  "Gigmästeri",
  "Sexmästeri",
  "Roddgrupp",
  "Festgrupp",
  "Rephelg",
  "Konsertmästeri",
  "Rekryteringskommitté",
  "Turnékommitté",
  "Valberedning",
  "Webmästeri",
  "Föräldramötet",
  "Arkivarie",
  "Utantillkommitté",
  "Övrig"
])

export const group = pgTable(
  "group",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: groupType("type").notNull(),
    // Null means CSK-wide. A Choir group itself is always CSK-wide, and a Section always belongs to one.
    choirId: uuid("choir_id").references((): AnyPgColumn => choir.groupId, { onDelete: "restrict" }),
    active: boolean("active").default(true).notNull()
  },
  (table) => [
    // Hand-written in drizzle/0011_groups.sql (2): the index is NULLS NOT DISTINCT, which Drizzle's
    // index builder cannot express, so two active CSK-wide groups (choir_id null) cannot share a
    // name while each Choir keeps its own namespace.
    uniqueIndex("group_name_choir_active_unique").on(table.name, table.choirId).where(sql`${table.active}`),
    index("group_choirId_idx").on(table.choirId),
    check("group_name_not_blank_check", sql`length(btrim(${table.name})) > 0`),
    check("group_choir_csk_wide_check", sql`${table.type} <> 'Choir' OR ${table.choirId} IS NULL`),
    check("group_section_in_choir_check", sql`${table.type} <> 'Section' OR ${table.choirId} IS NOT NULL`)
  ]
)

/** A 1:1 extension of a Choir group. */
export const choir = pgTable("choir", {
  groupId: uuid("group_id")
    .primaryKey()
    .references((): AnyPgColumn => group.id, { onDelete: "restrict" })
})

/** A 1:1 extension of a Section group, which sings exactly one Voice: KKB sings B, MKB1 sings B1. */
export const section = pgTable("section", {
  groupId: uuid("group_id")
    .primaryKey()
    .references(() => group.id, { onDelete: "restrict" }),
  voice: voice("voice").notNull()
})

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
    // Set exactly on Section Memberships, and contained in the Section's Voice (B1, B2 or B in KKB).
    // Hand-written in drizzle/0011_groups.sql (3): the `group_member_voice_check` trigger checks
    // both on insert and update, raising `group_member_voice_section_check` or
    // `group_member_voice_containment_check`. Drizzle cannot express triggers.
    voice: voice("voice")
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.groupId, table.startDate] }),
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

export const groupRelations = relations(group, ({ one, many }) => ({
  choir: one(choir, { fields: [group.choirId], references: [choir.groupId], relationName: "choirGroups" }),
  choirExtension: one(choir, { fields: [group.id], references: [choir.groupId], relationName: "choirExtension" }),
  sectionExtension: one(section, { fields: [group.id], references: [section.groupId] }),
  members: many(groupMember),
  positionHolders: many(positionHolder)
}))

export const choirRelations = relations(choir, ({ one, many }) => ({
  group: one(group, { fields: [choir.groupId], references: [group.id], relationName: "choirExtension" }),
  groups: many(group, { relationName: "choirGroups" })
}))

export const sectionRelations = relations(section, ({ one }) => ({
  group: one(group, { fields: [section.groupId], references: [group.id] })
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
