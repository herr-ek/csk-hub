import { defineRelations } from "drizzle-orm"
import { customType, pgEnum, pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { user } from "./auth"

// The Voice types, and what each user can sing. The org structure uses `voice` for Sections and
// Section Memberships; every write to `voice_capability` goes through `src/features/voice`. See
// GLOSSARY.md#groups for the language.
//
// `drizzle/20261004114247_groups/migration.sql` carries one addition for this file written by hand, marked
// "Hand-written in drizzle/20261004114247_groups/migration.sql" here and "Added by hand" there; drizzle-kit neither
// generates nor diffs it:
//   1. the `voice_family` and `voice_division` domains over the `voice` enum

// A Voice is a family (S, A, T, B) or one of its divisions (S1 … B2). The family of a division is
// derived, never stored. A Section may sing a family; a singer's Voice, in a Section Membership or
// a capability, is always a division.
export const voice = pgEnum("voice", ["S", "A", "T", "B", "S1", "S2", "A1", "A2", "T1", "T2", "B1", "B2"])

// Hand-written in drizzle/20261004114247_groups/migration.sql (1): `voice_family` and `voice_division` are Postgres
// domains over `voice`, restricted to families and divisions. This custom type only names the
// domain for drizzle-kit; it does not create it. Postgres has no `=` for a domain over an enum, so
// a filter on such a column casts it first: `${voiceCapability.voice}::voice = 'B1'`. Keys,
// ORDER BY and DISTINCT need no cast.
export const voiceDivision = customType<{ data: Exclude<(typeof voice.enumValues)[number], "S" | "A" | "T" | "B"> }>({
  dataType: () => "voice_division"
})

/** A `voice_family` domain column, for audiences targeted by Voice family; see (1) above. */
export const voiceFamily = customType<{ data: "S" | "A" | "T" | "B" }>({
  dataType: () => "voice_family"
})

/**
 * What a user can sing, independent of any Section Membership. Divisions only, by the column's
 * domain: being able to sing a whole family is recorded as being able to sing its divisions.
 */
export const voiceCapability = pgTable(
  "voice_capability",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // A `voice_division` domain column; see (1) above.
    voice: voiceDivision("voice").notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.voice] })]
)

export const voiceRelations = defineRelations({ user, voiceCapability }, (r) => ({
  voiceCapability: {
    user: r.one.user({ from: [r.voiceCapability.userId], to: [r.user.id], alias: "voiceCapability" })
  }
}))
