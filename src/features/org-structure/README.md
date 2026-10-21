# Org structure

Who is in which Group, Choir and Section, and who holds which Position. Groups and Positions are
both first-class here: Positions are held in Groups, and the rules tying them to Memberships are
why they share one module. Terminology lives in [`GLOSSARY.md`](../../../GLOSSARY.md#groups); the
implemented schema is described in [`Groups - DB Scheme.md`](../../../docs/schemas/Groups%20-%20DB%20Scheme.md).
Voices and what each user can sing are the separate [`voice`](../voice/README.md) feature.

## The write path

Application code writes the tables in `src/core/db/schema/org-structure.ts` only through this
module, and reads them through its read helpers rather than querying the tables. This is a
convention, not a test. The ops scripts are the deliberate exception: `bun run ops
reference-data` and `bun run ops seed-groups` write legacy tables directly and keep their
rules by hand. The read-only inventory uses this module's focused reconciliation entrypoint.

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
  `endLinkedPosition` for one office held in several Groups, such as the Board's Sexmästare
  who leads the Sexmästeri.
- Reads: `listCurrentGroupMembers`, `listCurrentGroupsOfUser`, `getCurrentPositionHolder`,
  `listChoirMembersByVoiceFamily`, `listCurrentPositionsOfUser`, and
  `listCurrentChoirAffiliationsOfUsers` (batched Choir/Section summaries).

The structure every environment shares (MK, DK and KK with their Sections and Voices, Styret and
the Position catalogue) comes from `bun run ops reference-data`, which can also run against
production. `bun run ops seed-groups` adds local example data on top. Both live in `scripts/`.

"Current" means no end date. Dates are calendar dates, `YYYY-MM-DD`; a period may end on the
day the next one starts.

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

## Additive appointment foundation (redesign ticket 01)

Migration `0017_expand-organisation-appointments` adds `direct_membership`,
`position_appointment`, and `appointment_grant`. It adds explicit `organisation_year`
and an internal `uses_appointment_model` compatibility marker on Groups. Legacy
commands, live reads, catalogue, and seeds keep their behaviour during this integration
branch. This foundation is not a completed or deployable domain cutover.

The universal `model` entrypoint exports fixed `GROUP_POLICIES`, the 16 stable
`POSITION_DEFINITIONS`, and `PositionCode`. New commands `createOrganisationGroup` and
`appointPosition` accept the same database-or-transaction contract. The latter stores
one tenure, validates full prerequisite coverage, and creates its fixed grant set
atomically. `listAppointmentMembersAt` reads dated grants with one roster entry per
User and every appointment retained. It deliberately does not feed legacy live reads.

`inventoryOrganisation` is a read-only public operation; the focused server-only
`@/features/org-structure/reconciliation` entrypoint is also available to ops without
loading screen exports. `bun run ops organisation-inventory` runs it in a PostgreSQL
repeatable-read, read-only transaction and prints JSON. Candidate mappings and pairs
are evidence for ticket 07, never permission to merge or write records.

Ticket 08 removes the marker, legacy commands/tables, and transitional read split
once every writer and consumer has migrated. Direct-member workflows, Helper conversion,
appointment handover/end/renewal, departure and archival protections, and combined
participation reads are delivered by the subsequent behaviour tickets. The implemented
storage and its hand-written exclusions/triggers are described in
[`Groups - DB Scheme.md`](../../../docs/schemas/Groups%20-%20DB%20Scheme.md).

## Concrete Groups and direct Memberships (redesign ticket 02)

The Groups page creates new-model Groups and prepares each year's ten annual Groups
with `prepareOrganisationYear`. Preparation is atomic and idempotent, preserves existing
identities and never copies participation. Year badges and lifecycle phases use the
explicit year and evaluated date. Legacy Groups remain discoverable pending reconciliation.

`updateOrganisationGroup` edits concrete metadata. A name correction keeps participation;
changing the type, Choir or year of an occupied Group returns `group-has-participation`
before writing anything. Empty legacy Groups may be explicitly classified. This command
does not infer annual identity from a legacy name or convert populated legacy records.

`addDirectMembership`, `changeDirectMembership`, `correctDirectMembership`, and
`endDirectMembership` manage dated direct participation. Ordinary changes split periods;
explicit corrections edit the selected record, including historical/prepared participation.
`listDirectMemberships` exposes all periods and `listDirectMembersAt` evaluates a date.
Annual periods default to an exclusive 1 July end; admin forms display/input the inclusive
last day. Fluid participation has no invented June expiry. Section placement retains
Voice containment, Choir coverage and one overlapping Section per Choir. Corrections and
legacy departure paths refuse changes that strand prerequisites. `correctLegacyMembership`
corrects retained singer/fluid records without silently converting them. Annual legacy
periods require the later explicit year reconciliation before their dates can change.
Unresolved annual Groups also refuse new public direct additions with `annual-group-needs-year`;
admin forms explain how to prepare/select a concrete year and omit the legacy Add action.

Board and Föräldramötet additions are refused by both direct-member commands and
`startMembership`, and absent from the interface. Legacy holding tests seed retained
participation explicitly. Legacy linked-holding commands remain transitional and cannot
write new-model Groups. Archival refuses current/future appointment dependencies.

The new direct workflows are shown alongside retained legacy data. The complete effective
roster, member-profile/directory cutover, and legacy conversion remain the following tickets;
this branch still is not a deployable partial migration.

## Annual appointment lifecycle (redesign ticket 03)

`appointPosition` creates one appointment and resolves its mandatory companion Groups from the
fixed catalogue in one transaction. Appointments in Groups that permit Helpers close any
overlapping direct Helper period at the appointment start, preserving its earlier history.
`replaceAppointmentHolder`, `endAppointment`, and `cancelPreparedAppointment` act on the
appointment and its complete grant set. `correctAnnualAppointment` edits an annual appointment's
holder, applicable Position, concrete context/year, and dates, then re-resolves the grant set in
the same transaction. Refused edits leave the previous appointment and grants intact.

Annual contexts use an exclusive 1 July end boundary; the Admin form displays and accepts the
inclusive 30 June last day. The annual appointment manager lists current, future, and historical
appointments on their context Group, with correction, early ending, handover, and prepared
cancellation actions. Annual renewal remains a separate explicit appointment, including when the
same person continues.

Choir-scoped annual Konsertmästare and Gigmästare use the Choir as appointment context
and share the concrete year's Konsertmästeri or Gigmästeri with CSK-wide offices.
Each Choir appointment requires membership covering its full tenure; while legacy
Choir Membership rows remain during the additive transition, they count as evidence too.
Correcting a representative re-resolves its annual grant and checks the destination
Choir's membership in the same transaction. `listEffectiveMembersAt` combines direct
membership with dated appointment grants, deduplicates each person, and retains each
Position's context for aggregate rosters. The Choir Admin page assigns, corrects, ends,
and cancels annual representative appointments; the shared committee roster links each
responsibility back to its Choir.
Ticket06 will consolidate this roster with all current and dated membership consumers;
this slice uses the effective read in the Admin Group detail flow only.
