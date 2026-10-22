import { relations, sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { EXPLICIT_GROUP_NAME_TYPES } from "@/core/org-structure/group-names"
import { GroupType, type PositionCode } from "@/core/org-structure/identifiers"
import { user } from "./auth"
import { voice, voiceDivision } from "./voice"

// Groups, their Memberships, and Positions held in them: the organisation's structure. Every
// write to these tables goes through `src/features/org-structure-management`, which enforces the rules the
// database cannot express. See GLOSSARY.md#groups for the language.
//
// Drizzle cannot express everything below, so `drizzle/0011_groups.sql` carries two additions
// written by hand for these tables, each marked "Hand-written in drizzle/0011_groups.sql" here and
// "Added by hand" there ((1), the voice domains, is described in `./voice.ts`):
//   2. NULLS NOT DISTINCT on `group_name_choir_active_unique`
//   3. the direct_membership policy triggers and appointment constraints in the final cutover migration.
// drizzle-kit neither generates nor diffs them. A regenerated migration loses them unless they are
// copied back, and changing one later takes a hand-written migration.

export const groupType = pgEnum("group_type", GroupType)

export const group = pgTable(
  "group",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    type: groupType("type").notNull(),
    // Null means CSK-wide. A Choir group itself is always CSK-wide, and a Section always belongs to one.
    choirId: uuid("choir_id").references((): AnyPgColumn => choir.groupId, { onDelete: "restrict" }),
    active: boolean("active").default(true).notNull(),
    organisationYear: integer("organisation_year")
  },
  (table) => [
    // Hand-written in drizzle/0011_groups.sql (2): the index is NULLS NOT DISTINCT, which Drizzle's
    // index builder cannot express, so two active CSK-wide groups (choir_id null) cannot share a
    // name while each Choir keeps its own namespace.
    uniqueIndex("group_name_choir_active_unique")
      .on(table.name, table.choirId)
      .where(sql`${table.active} AND ${table.name} IS NOT NULL`),
    uniqueIndex("group_annual_identity_unique")
      .on(table.type, table.organisationYear)
      .where(sql`${table.organisationYear} IS NOT NULL`),
    uniqueIndex("group_continuing_singleton_unique")
      .on(table.type)
      .where(sql`${table.type} = ${GroupType.ParentsMeeting}`.inlineParams()),
    uniqueIndex("group_choir_team_unique")
      .on(table.type, table.choirId)
      .where(
        sql`${table.active} AND ${table.type} IN (${sql.join(
          [GroupType.EquipmentTeam, GroupType.PartyTeam, GroupType.RehearsalWeekendTeam].map((type) =>
            sql`${type}`.inlineParams()
          ),
          sql`, `
        )})`
      ),
    check(
      "group_organisation_year_check",
      sql`${table.organisationYear} IS NULL OR ${table.organisationYear} BETWEEN 1000 AND 9998`
    ),
    index("group_choirId_idx").on(table.choirId),
    check(
      "group_name_policy_check",
      sql`
      CASE WHEN ${table.type} IN (${sql.join(
        EXPLICIT_GROUP_NAME_TYPES.map((type) => sql`${type}`.inlineParams()),
        sql`, `
      )})
        THEN ${table.name} IS NOT NULL AND length(btrim(${table.name})) > 0
        ELSE ${table.name} IS NULL END
    `
    ),
    check(
      "group_choir_csk_wide_check",
      sql`${table.type} <> ${GroupType.Choir} OR ${table.choirId} IS NULL`.inlineParams()
    ),
    check(
      "group_section_in_choir_check",
      sql`${table.type} <> ${GroupType.Section} OR ${table.choirId} IS NOT NULL`.inlineParams()
    )
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

export const groupRelations = relations(group, ({ one, many }) => ({
  choir: one(choir, { fields: [group.choirId], references: [choir.groupId], relationName: "choirGroups" }),
  choirExtension: one(choir, { fields: [group.id], references: [choir.groupId], relationName: "choirExtension" }),
  sectionExtension: one(section, { fields: [group.id], references: [section.groupId] }),
  directMembers: many(directMembership),
  appointments: many(positionAppointment)
}))

export const choirRelations = relations(choir, ({ one, many }) => ({
  group: one(group, { fields: [choir.groupId], references: [group.id], relationName: "choirExtension" }),
  groups: many(group, { relationName: "choirGroups" })
}))

export const sectionRelations = relations(section, ({ one }) => ({
  group: one(group, { fields: [section.groupId], references: [group.id] })
}))

/** Independent direct participation. Appointment grants never copy rows here. */
export const directMembership = pgTable(
  "direct_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    voice: voiceDivision("voice")
  },
  (table) => [
    index("direct_membership_group_idx").on(table.groupId),
    check("direct_membership_period_check", sql`${table.endDate} IS NULL OR ${table.endDate} > ${table.startDate}`)
  ]
)

/** One responsibility, in one context, with one tenure across every granted Group. */
export const positionAppointment = pgTable(
  "position_appointment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    positionCode: text("position_code").$type<PositionCode>().notNull(),
    contextGroupId: uuid("context_group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" }),
    organisationYear: integer("organisation_year"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date")
  },
  (table) => [
    index("position_appointment_user_idx").on(table.userId),
    check("position_appointment_period_check", sql`${table.endDate} IS NULL OR ${table.endDate} > ${table.startDate}`),
    check(
      "position_appointment_year_check",
      sql`${table.organisationYear} IS NULL OR ${table.organisationYear} BETWEEN 1000 AND 9998`
    )
  ]
)

/** A connection only: User, Position, and dates belong exclusively to the appointment. */
export const appointmentGrant = pgTable(
  "appointment_grant",
  {
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => positionAppointment.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" })
  },
  (table) => [
    primaryKey({ columns: [table.appointmentId, table.groupId] }),
    index("appointment_grant_group_idx").on(table.groupId)
  ]
)

// Hand-written in 0017_expand-organisation-appointments.sql: btree_gist range exclusions
// on appointment occupancy, Board exclusivity and direct Membership overlap; fixed-policy
// triggers on group, position_appointment, direct_membership and appointment_grant. Drizzle
// does not diff these. Preserve them in later migrations; see docs/schemas/Groups - DB Scheme.md.
