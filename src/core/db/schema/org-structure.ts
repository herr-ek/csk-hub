import { defineRelations, sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { EXPLICIT_GROUP_NAME_TYPES } from "@/core/org-structure/group-names"
import { GroupType, type PositionCode } from "@/core/org-structure/identifiers"
import { user } from "./auth"
import { voice, voiceDivision } from "./voice"

// Groups, their Memberships, and Positions held in them: the organisation's structure. Every
// write to these tables goes through `src/features/org-structure`, which enforces the rules the
// database cannot express. See GLOSSARY.md#groups for the language.
//
// Drizzle cannot express every database invariant. The Voice domains are described in
// `./voice.ts`; `drizzle/20261102210555_redesign-organisation-appointments/migration.sql` also maintains
// NULLS NOT DISTINCT name uniqueness, range exclusions and organisation policy triggers.
// Drizzle neither generates nor diffs these additions; preserve them in later migrations.

export const groupType = pgEnum("group_type", GroupType)

export const group = pgTable(
  "group",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Section and other derived Group names are null; see derive-section-names migration.
    name: text("name"),
    type: groupType("type").notNull(),
    // Null means CSK-wide. A Choir group itself is always CSK-wide, and a Section always belongs to one.
    choirId: uuid("choir_id").references((): AnyPgColumn => choir.groupId, { onDelete: "restrict" }),
    // Manual retirement applies only to non-annual Groups. Annual lifecycle comes from the year.
    active: boolean("active").default(true).notNull(),
    organisationYear: integer("organisation_year")
  },
  (table) => [
    // Hand-written in drizzle/20261102210555_redesign-organisation-appointments/migration.sql: the index is NULLS NOT DISTINCT, which Drizzle's
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
    check("group_annual_active_check", sql`${table.organisationYear} IS NULL OR ${table.active}`),
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

/** A Section's Voice determines its derived name with its Choir: KKB sings B, MKB1 sings B1. */
export const section = pgTable("section", {
  groupId: uuid("group_id")
    .primaryKey()
    .references(() => group.id, { onDelete: "restrict" }),
  voice: voice("voice").notNull()
})

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
    // Required for Sections and gig groups; null elsewhere, enforced by the policy trigger.
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

// Hand-written in drizzle/20261102210555_redesign-organisation-appointments/migration.sql: btree_gist range exclusions
// on appointment occupancy, Board exclusivity and direct Membership overlap; fixed-policy
// triggers on group, position_appointment and direct_membership. Drizzle
// does not diff these. Preserve them in later migrations; see docs/schemas/Groups - DB Scheme.md.

export const orgStructureRelations = defineRelations(
  { choir, group, directMembership, positionAppointment, section, user },
  (r) => ({
    group: {
      choir: r.one.choir({ from: [r.group.choirId], to: [r.choir.groupId], alias: "choirGroups" }),
      choirExtension: r.one.choir({ from: [r.group.id], to: [r.choir.groupId], alias: "choirExtension" }),
      sectionExtension: r.one.section({ from: [r.group.id], to: [r.section.groupId] }),
      directMembers: r.many.directMembership({ from: [r.group.id], to: [r.directMembership.groupId] }),
      appointments: r.many.positionAppointment({ from: [r.group.id], to: [r.positionAppointment.contextGroupId] })
    },
    choir: {
      group: r.one.group({ from: [r.choir.groupId], to: [r.group.id], alias: "choirExtension" }),
      groups: r.many.group({ from: [r.choir.groupId], to: [r.group.choirId], alias: "choirGroups" })
    },
    section: {
      group: r.one.group({ from: [r.section.groupId], to: [r.group.id] })
    },
    directMembership: {
      group: r.one.group({ from: [r.directMembership.groupId], to: [r.group.id] }),
      member: r.one.user({ from: [r.directMembership.userId], to: [r.user.id], alias: "directMembership" })
    },
    positionAppointment: {
      context: r.one.group({ from: [r.positionAppointment.contextGroupId], to: [r.group.id] }),
      holder: r.one.user({ from: [r.positionAppointment.userId], to: [r.user.id], alias: "positionAppointment" })
    }
  })
)
