# Org structure

Who is in which Group, Choir and Section, and who holds which Position. Groups and Positions are
both first-class here: Positions are held in Groups, and the rules tying them to Memberships are
why they share one module. Terminology lives in [`GLOSSARY.md`](../../../GLOSSARY.md#groups); the
scheme it implements is "Revised scheme (v3)" in `docs/Groups - DB Scheme.md`, introduced in #78.
Voices and what each user can sing are the separate [`voice`](../voice/README.md) feature.

## The write path

Application code writes the tables in `src/core/db/schema/org-structure.ts` only through this
module, and reads them through its read helpers rather than querying the tables. The
`core/authz` module is an exception for minimal authorization-specific fact reads; its
definition of current Memberships and Position holdings must match this module. See
[`docs/authorization.md`](../../../docs/authorization.md) for the adoption contract.
This is a convention, not a test. The ops scripts are another deliberate exception: `bun run ops
reference-data` and `bun run ops seed-groups` write the tables directly, so that scripts never
depend on a feature, and they keep these rules by hand.

The rules below are not database constraints, so going around this module breaks them
silently:

- A Choir is always CSK-wide. Other Groups are CSK-wide or belong directly to one Choir.
- Only current members of a Choir can join a Group that belongs to it. Placing a singer in a
  Section is how they join the Choir, so it starts the Choir Membership when there is none.
- Every Choir has exactly four Sections, each singing one Voice, and no two overlap (B rules
  out B1 in the same Choir). Sections are created only with their Choir.
- A singer is in the Choir and exactly one of its Sections, with one Voice division that the
  Section's Voice contains: B1 or B2 in KKB, which sings B.
- A Position holder is a current member, the Group's type allows the Position, and ending a
  Membership ends the holder's Positions in that Group. In a Group of elected posts, the Board
  (`holdsElectedPosts`), a member holds at most one Position; elsewhere they may hold several.
  Leaving a Choir ends Memberships, and Positions, in every Group that belongs to it.
- A Position may be limited to some Groups of its types, as Gigmästare KK to KK and the
  Gigmästeri; without a limit, every Group of an allowed type has it. A Group cannot leave the
  limit while someone holds the Position there.
- A Voice change ends one Membership row and starts another; history is never rewritten.
  Leaving a Section ends Positions in it, while a change within one Section keeps them.
- Groups are archived, never deleted. Archiving a Choir archives its Sections.

The database still enforces what it can: a Choir is CSK-wide and a Section belongs to a Choir;
one current Membership per user and Group; one current holder per Position and Group; and
active Group names unique per Choir. Two things are added by hand to the migration because
Drizzle cannot express them, and are marked in the schema file: `NULLS NOT DISTINCT` on the
name index, and the `group_member_voice_check` trigger, which requires a Voice exactly on
Section Memberships and checks that the Section's Voice contains it. `group_member.voice` is a
`voice_division`, so the database refuses a family on its own.

## Interface

`@/features/org-structure` is server-only. `@/features/org-structure/model` is universal: the
`GroupType`, `IsoDate` and result types. The Voice types and `familyOf` / `contains` come from
`@/features/voice/model`.

Every command takes the database client or a transaction as its first argument, so a caller
can make it one step of a larger transaction; a refused command rolls back only its own
savepoint. Commands return `{ success: true, data }` or `{ success: false, error }`, where
`error` is an `OrgStructureViolation`. Rule violations, including constraint violations from
races, never surface as thrown errors.

- Structure: `createChoir`, `createGroup`, `renameGroup`, `archiveGroup`, `createPosition`,
  `updatePosition` (`renamePosition`, `setPositionGroupTypes` and `setPositionGroups`, as one
  change), `allowPositionInGroupTypes`.
- Membership: `startMembership`, `endMembership`, `placeSinger` (the Voice decides the
  Section: the one whose Voice contains it), `placeSingerInSection` (refuses a Voice the
  Section's Voice does not contain), `changeVoice`.
- Positions: `startPositionHolding`, `endPositionHolding`, `replacePositionHolder` (a handover
  on the new holder's start date), and `startLinkedPosition` /
  `endLinkedPosition` for one Position held in several Groups, such as the Board's Sexmästare
  who leads the Sexmästeri.
- Reads: `listCurrentGroupMembers`, `listCurrentGroupsOfUser`, `getCurrentPositionHolder`,
  `listChoirMembersByVoiceFamily`, `listCurrentPositionsOfUser`, and
  `listCurrentChoirAffiliationsOfUsers` (batched Choir/Section summaries).

The structure every environment shares (MK, DK and KK with their Sections and Voices, Styret and
the Position catalogue) comes from `bun run ops reference-data`, which can also run against
production. `bun run ops seed-groups` adds local example data on top. Both live in `scripts/`.

"Current" means no end date. Dates are calendar dates, `YYYY-MM-DD`; a period may end on the
day the next one starts.

Position writes share advisory locks in this order: the Position catalogue, Position-in-Group
slots ordered by Group ID, then User IDs in sorted order, before locking or updating Position
holder rows.
Assignments and catalogue changes use the same catalogue lock, so an allowance cannot be revoked
between validation and insertion. Membership-ending commands take the User lock before ending that
User's holder rows, and do not acquire catalogue or Position-in-Group locks; they therefore cannot
form a reverse wait cycle with a handover.

## Admin pages

The Admin surface over this module is split by task. `/admin/org-structure` lists the Choirs and
their Sections, where singers are placed and change Voice; `/admin/org-structure/groups` lists every
other group and the Position catalogue. Both link to `/admin/org-structure/[groupId]`, whose back
link returns to the page that lists the group. The feature entrypoint exports their screens;
everything else lives in `ui/`:

```text
ui/
  choirs/      the Choirs and their Sections, for placing singers
  groups/      every other group, and creating, renaming and archiving groups
  detail/      one group's Members and Position holders, with their history
  catalogue/   the Positions, the group types each is allowed in, and any limit to groups
  group-summaries.ts, group-list.tsx   what both overviews show of a group
  command-dialog.tsx, run-command.ts   the shared shape of every admin command
```

Every Server Action goes through `runGroupCommand`: `requireAdmin`, validate the form, run one
module command, and return its violation as `{ status: "error", error }`. The client translates
the kind from `Groups.errors`, so adding an `OrgStructureViolation` means adding its message to
every catalogue; the typed translation keys fail the typecheck until you do. Reads for a screen
live beside it (`query.ts`) and are shaped for that screen.

## Tests

The tests run against a real, freshly migrated database created beside the local one in
`POSTGRES_URL` and dropped afterwards (`test/database.ts`). Without a reachable local
Postgres they are skipped with a warning. Migrations create no rows, so `test-support.ts` builds
the structure the tests name through the module's own commands.
