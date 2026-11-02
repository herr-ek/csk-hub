import { defineRelations, sql } from "drizzle-orm"
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
import { voice, voiceDivision } from "./voice"

// Groups, their Memberships, and the Positions held in them: the organisation's structure. Every
// write to these tables goes through `src/features/org-structure`, which enforces the rules the
// database cannot express. See GLOSSARY.md#groups for the language.
//
// Drizzle cannot express everything below, so `drizzle/20261004114247_groups/migration.sql` carries two additions
// written by hand for these tables, each marked "Hand-written in drizzle/20261004114247_groups/migration.sql" here and
// "Added by hand" there ((1), the voice domains, is described in `./voice.ts`):
//   2. NULLS NOT DISTINCT on `group_name_choir_active_unique`
//   3. the `group_member_voice_check` trigger and its function, replaced in
//      `drizzle/20261012100937_member-voice-division/migration.sql` when `group_member.voice` became a division
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
    // Hand-written in drizzle/20261004114247_groups/migration.sql (2): the index is NULLS NOT DISTINCT, which Drizzle's
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
    // Set exactly on Section Memberships: a division, by the column's `voice_division` domain (see
    // ./voice.ts), contained in the Section's Voice (B1 or B2 in KKB, which sings B).
    // Hand-written in drizzle/20261004114247_groups/migration.sql (3): the `group_member_voice_check` trigger checks
    // both on insert and update, raising `group_member_voice_section_check` or
    // `group_member_voice_containment_check`. Drizzle cannot express triggers.
    voice: voiceDivision("voice")
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

/**
 * The groups a Position is limited to, if any: with rows here, the Position is held only in these
 * groups, and still only where their type allows it, as Gigmästare KK in KK and the Gigmästeri.
 * Without rows, every group of an allowed type has it.
 */
export const positionGroup = pgTable(
  "position_group",
  {
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "restrict" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" })
  },
  (table) => [
    primaryKey({ columns: [table.positionId, table.groupId] }),
    index("position_group_groupId_idx").on(table.groupId)
  ]
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

export const orgStructureRelations = defineRelations(
  { choir, group, groupMember, groupTypePosition, position, positionGroup, positionHolder, section, user },
  (r) => ({
    group: {
      choir: r.one.choir({ from: [r.group.choirId], to: [r.choir.groupId], alias: "choirGroups" }),
      choirExtension: r.one.choir({ from: [r.group.id], to: [r.choir.groupId], alias: "choirExtension" }),
      sectionExtension: r.one.section({ from: [r.group.id], to: [r.section.groupId] }),
      members: r.many.groupMember({ from: [r.group.id], to: [r.groupMember.groupId] }),
      positionHolders: r.many.positionHolder({ from: [r.group.id], to: [r.positionHolder.groupId] })
    },
    choir: {
      group: r.one.group({ from: [r.choir.groupId], to: [r.group.id], alias: "choirExtension" }),
      groups: r.many.group({ from: [r.choir.groupId], to: [r.group.choirId], alias: "choirGroups" })
    },
    section: {
      group: r.one.group({ from: [r.section.groupId], to: [r.group.id] })
    },
    groupMember: {
      group: r.one.group({ from: [r.groupMember.groupId], to: [r.group.id] }),
      member: r.one.user({ from: [r.groupMember.userId], to: [r.user.id], alias: "groupMember" })
    },
    position: {
      groupTypes: r.many.groupTypePosition({ from: [r.position.id], to: [r.groupTypePosition.positionId] }),
      groups: r.many.positionGroup({ from: [r.position.id], to: [r.positionGroup.positionId] }),
      holders: r.many.positionHolder({ from: [r.position.id], to: [r.positionHolder.positionId] })
    },
    positionGroup: {
      position: r.one.position({ from: [r.positionGroup.positionId], to: [r.position.id] }),
      group: r.one.group({ from: [r.positionGroup.groupId], to: [r.group.id] })
    },
    groupTypePosition: {
      position: r.one.position({ from: [r.groupTypePosition.positionId], to: [r.position.id] })
    },
    positionHolder: {
      group: r.one.group({ from: [r.positionHolder.groupId], to: [r.group.id] }),
      position: r.one.position({ from: [r.positionHolder.positionId], to: [r.position.id] }),
      holder: r.one.user({ from: [r.positionHolder.userId], to: [r.user.id], alias: "positionHolder" })
    }
  })
)
