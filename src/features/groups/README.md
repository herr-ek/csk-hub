# Groups

Who is in which Choir and Section, and who holds which Position. Terminology lives in
[`CONTEXT.md`](../../../CONTEXT.md#groups); the scheme it implements is "Revised scheme (v2)" in
`docs/Groups - DB Scheme.md`, introduced in #78.

## The only write path

Nothing outside this folder writes to the tables in `src/core/db/schema/groups.ts`; an
architecture test refuses any import of that schema from elsewhere. Read helpers live here
too, so other features ask this module rather than querying the tables.

The rules below are not database constraints, so going around this module breaks them
silently:

- A Choir is always CSK-wide. Other Groups are CSK-wide or belong directly to one Choir.
- Joining a Group that belongs to a Choir starts a Choir Membership when there is none.
- Every Choir has exactly four Sections. Each sings at least one Voice, and a Voice belongs
  to at most one Section per Choir. Sections are created only with their Choir.
- A singer is in the Choir and exactly one of its Sections, with their Voice set. The Voice
  is only ever set on Section Memberships.
- A Position holder is a current member, the Group's type allows the Position, and ending a
  Membership ends the holder's Positions in that Group. Leaving a Choir ends Memberships, and
  Positions, in every Group that belongs to it.
- A Voice change ends one Membership row and starts another; history is never rewritten.
  Leaving a Section ends Positions in it, while a change within one Section keeps them.
- Groups are archived, never deleted. Archiving a Choir archives its Sections.

The database still enforces what it can: the composite key from a Section Membership's Voice
to the Voices its Section sings, one current Membership per user and Group, one current
holder per Position and Group, and active Group names unique per Choir (`NULLS NOT DISTINCT`,
added by hand to the migration because Drizzle cannot express it).

## Interface

`@/features/groups` is server-only. `@/features/groups/model` is universal: the `Voice`,
`Part` and `GroupType` types, and `voiceToPart`, the only place Voice → Part is decided.

Every command takes the database client or a transaction as its first argument, so a caller
can make it one step of a larger transaction; a refused command rolls back only its own
savepoint. Commands return `{ success: true, data }` or `{ success: false, error }`, where
`error` is a `GroupsViolation`. Rule violations, including constraint violations from races,
never surface as thrown errors.

- Structure: `createChoir`, `createGroup`, `archiveGroup`, `createPosition`,
  `allowPositionInGroupTypes`.
- Membership: `startMembership`, `endMembership`, `placeSinger` (the Voice decides the
  Section), `changeVoice`.
- Positions: `startPositionHolding`, `endPositionHolding`, and `startLinkedPosition` /
  `endLinkedPosition` for one office held in several Groups, such as the Board's Sexmästare
  who leads the Sexmästeri.
- Reads: `listCurrentGroupMembers`, `listCurrentGroupsOfUser`, `getCurrentPositionHolder`,
  `listChoirMembersByPart`, `listVoiceCapabilities`.
- `seedGroups` creates MK, DK and KK with their Sections and the Position catalogue; run it
  with `bun run ops seed-groups`.

"Current" means no end date. Dates are calendar dates, `YYYY-MM-DD`; a period may end on the
day the next one starts.

## Tests

The tests run against a real, freshly migrated database created beside the local one in
`POSTGRES_URL` and dropped afterwards (`test/database.ts`). Without a reachable local
Postgres they are skipped with a warning.
