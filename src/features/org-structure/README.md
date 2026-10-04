# Org structure

Who is in which Group, Choir and Section, and who holds which Position. Groups and Positions are
both first-class here: Positions are held in Groups, and the rules tying them to Memberships are
why they share one module. Terminology lives in [`CONTEXT.md`](../../../CONTEXT.md#groups); the
scheme it implements is "Revised scheme (v3)" in `docs/Groups - DB Scheme.md`, introduced in #78.
Voices and what each user can sing are the separate [`voice`](../voice/README.md) feature.

## The write path

Application code writes the tables in `src/core/db/schema/org-structure.ts` only through this
module, and reads them through its read helpers rather than querying the tables. This is a
convention, not a test. The ops scripts are the deliberate exception: `bun run ops
reference-data` and `bun run ops seed-groups` write the tables directly, so that scripts never
depend on a feature, and they keep these rules by hand.

The rules below are not database constraints, so going around this module breaks them
silently:

- A Choir is always CSK-wide. Other Groups are CSK-wide or belong directly to one Choir.
- Joining a Group that belongs to a Choir starts a Choir Membership when there is none.
- Every Choir has exactly four Sections, each singing one Voice, and no two overlap (B rules
  out B1 in the same Choir). Sections are created only with their Choir.
- A singer is in the Choir and exactly one of its Sections, with one Voice that the
  Section's Voice contains.
- A Position holder is a current member, the Group's type allows the Position, and ending a
  Membership ends the holder's Positions in that Group. Leaving a Choir ends Memberships, and
  Positions, in every Group that belongs to it.
- A Voice change ends one Membership row and starts another; history is never rewritten.
  Leaving a Section ends Positions in it, while a change within one Section keeps them.
- Groups are archived, never deleted. Archiving a Choir archives its Sections.

The database still enforces what it can: a Choir is CSK-wide and a Section belongs to a Choir;
one current Membership per user and Group; one current holder per Position and Group; and
active Group names unique per Choir. Two things are added by hand to the migration because
Drizzle cannot express them, and are marked in the schema file: `NULLS NOT DISTINCT` on the
name index, and the `group_member_voice_check` trigger, which requires a Voice exactly on
Section Memberships and checks that the Section's Voice contains it.

## Interface

`@/features/org-structure` is server-only. `@/features/org-structure/model` is universal: the
`GroupType`, `IsoDate` and result types. The Voice types and `familyOf` / `contains` come from
`@/features/voice/model`.

Every command takes the database client or a transaction as its first argument, so a caller
can make it one step of a larger transaction; a refused command rolls back only its own
savepoint. Commands return `{ success: true, data }` or `{ success: false, error }`, where
`error` is an `OrgStructureViolation`. Rule violations, including constraint violations from
races, never surface as thrown errors.

- Structure: `createChoir`, `createGroup`, `archiveGroup`, `createPosition`,
  `allowPositionInGroupTypes`.
- Membership: `startMembership`, `endMembership`, `placeSinger` (the Voice decides the
  Section: the one whose Voice contains it), `changeVoice`.
- Positions: `startPositionHolding`, `endPositionHolding`, and `startLinkedPosition` /
  `endLinkedPosition` for one office held in several Groups, such as the Board's Sexmästare
  who leads the Sexmästeri.
- Reads: `listCurrentGroupMembers`, `listCurrentGroupsOfUser`, `getCurrentPositionHolder`,
  `listChoirMembersByVoiceFamily`.

The structure every environment shares (MK, DK and KK with their Sections and Voices, Styret and
the Position catalogue) comes from `bun run ops reference-data`, which can also run against
production. `bun run ops seed-groups` adds local example data on top. Both live in `scripts/`.

"Current" means no end date. Dates are calendar dates, `YYYY-MM-DD`; a period may end on the
day the next one starts.

## Tests

The tests run against a real, freshly migrated database created beside the local one in
`POSTGRES_URL` and dropped afterwards (`test/database.ts`). Without a reachable local
Postgres they are skipped with a warning. Migrations create no rows, so `test-support.ts` builds
the structure the tests name through the module's own commands.
