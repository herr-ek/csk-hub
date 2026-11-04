# Organisation structure

This feature owns Group and participation reads and writes. Fixed definitions and universal
contracts live in [`@/core/org-structure`](../../core/org-structure/README.md). The domain language
is in the [glossary](../../../GLOSSARY.md#groups); the [schema guide](../../../docs/schemas/Groups%20-%20DB%20Scheme.md)
describes the storage. Voice containment belongs to the [Voice feature](../voice/README.md).

## Storage and invariants

A Group is CSK-wide or belongs directly to one Choir. Annual Groups have separate identities
for each July–June Organisational year. Other Groups have no automatic annual renewal.
Direct Membership records independent dated participation, including singer placement and
Helpers. One Position appointment records a holder, responsibility context, year when annual,
and tenure. The catalogue determines its companion Memberships; those connections are derived
by `appointmentMemberships`, never stored as extra Membership rows. Current catalogue rules
also apply to historical appointments; there are no versioned policy snapshots.

All stored periods include their start and exclude their end. Current reads evaluate those
periods at today's date, including scheduled end dates and excluding future starts.

Commands enforce the relationships the database cannot fully express:

- Section and gig-group Memberships require a Voice division; all other direct Memberships
  have none. A gig Voice is independent of Section placement. Gig Voice edits
  update membership metadata without changing its identity or dates. A Section's Voice contains the singer's Voice division. Choir participation covers every
  Section period, with at most one overlapping Section in each Choir.
- A Position's context has the type fixed by its code. Required companion Groups must exist,
  and annual companions match the appointment year.
- Choir, Section, and gig-group appointments require independent direct Membership throughout
  the tenure. Taking or ending the responsibility preserves that Membership. Ending or changing
  prerequisite participation is refused if it would invalidate an appointment.
- One Position has at most one holder in its context on a date. A person holds at most one
  Position in a particular Board at a time. Appointments in distinct contexts may coexist.
- Taking a Position replaces overlapping Helper participation in its granted Groups. Ending
  the appointment does not silently restore the Helper period.
- Section names use the owning Choir name and the Section Voice, such as KKB for both B1 and B2
  singers in KK's B Section. Choir renames change the label without changing Section identities.
- Group names follow the fixed naming policy. Annual lifecycle follows the year; manual
  archival is for non-annual Groups. Archiving a Choir also archives its Sections.

## Integration

Application writes go through this server-only feature. Commands accept a database or a caller's
transaction, use savepoints, and return typed rule violations. Per-user locks serialize changes;
database range exclusions protect occupancy and overlapping direct periods. Hand-written policy
functions, triggers, and constraints must remain aligned with the catalogue in later migrations.
Operational seeds are the deliberate writer exception and must preserve the same invariants.

Use effective participation reads for rosters, profiles, and authorization relationships. Combining
raw direct Memberships and appointments separately can omit granted Groups or duplicate people.
Authorization adoption follows the [authorization guide](../../../docs/authorization.md).

The existing Admin screens support basic Group creation, direct participation, singer placement,
and appointment assignment/end through this model. There is no runtime editor for formal Positions.

## Migration and verification

The redesign migration drops the legacy participation and Position tables without converting their
records. Its cutover assumes disposable organisation data and a fresh reset/reseed. Do not apply it
to retained participation data expecting an automatic conversion.

Database tests create, migrate, and drop disposable PostgreSQL databases using the local
`POSTGRES_URL`. Skipped database tests do not establish that migrations or constraints work.

The subsequent `derive-section-names` migration clears only redundant Section names and updates
the naming constraint. It retains Section UUIDs, Voice rows, Choir relationships, Direct Memberships,
appointments, and historical periods. Reference seeding matches Sections by Choir and Voice and
retains the existing UUID tokens.
