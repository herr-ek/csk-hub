import { relations } from "drizzle-orm"
import { customType, pgEnum, pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { user } from "./auth"

// The Voice types, and what each user can sing. The org structure uses `voice` for Sections and
// Section Memberships; every write to `voice_capability` goes through `src/features/voice`. See
// GLOSSARY.md#groups for the language.
//
// `drizzle/0011_groups.sql` carries one addition for this file written by hand, marked
// "Hand-written in drizzle/0011_groups.sql" here and "Added by hand" there; drizzle-kit neither
// generates nor diffs it:
//   1. the `voice_family` and `voice_division` domains over the `voice` enum

// A Voice is a family (S, A, T, B) or one of its divisions (S1 … B2). The family of a division is
// derived, never stored.
export const voice = pgEnum("voice", ["S", "A", "T", "B", "S1", "S2", "A1", "A2", "T1", "T2", "B1", "B2"])

// Hand-written in drizzle/0011_groups.sql (1): `voice_family` and `voice_division` are Postgres
// domains over `voice`, restricted to families and divisions. This custom type only names the
// domain for drizzle-kit; it does not create it. Postgres has no `=` for a domain over an enum, so
// a filter on such a column casts it first: `${voiceCapability.voice}::voice = 'B1'`. Keys,
// ORDER BY and DISTINCT need no cast. Only `voice_division` has a column yet; `voice_family`
// waits for news targeting and has no Drizzle counterpart.
const voiceDivision = customType<{ data: Exclude<(typeof voice.enumValues)[number], "S" | "A" | "T" | "B"> }>({
  dataType: () => "voice_division"
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

export const voiceCapabilityRelations = relations(voiceCapability, ({ one }) => ({
  user: one(user, { fields: [voiceCapability.userId], references: [user.id], relationName: "voiceCapability" })
}))
