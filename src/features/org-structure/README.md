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

- Section and gig-group Memberships require a Voice division, and Rekryteringskommittén's Helpers a
  Voice family; all other direct Memberships have neither. Joining a gig group or Rekryteringskommittén,
  or changing Voice there, requires a matching capability or a current Section Voice, checked only
  then. A gig Voice is independent of Section placement. Gig Voice edits
  update membership metadata without changing its identity or dates. A Section's Voice contains the singer's Voice division. Choir participation covers every
  Section period, with at most one overlapping Section in each Choir.
- A Position's context has the type fixed by its code. Required companion Groups must exist,
  and annual companions match the appointment year.
- Choir, Section, and gig-group appointments require independent direct Membership throughout
  the tenure. Taking or ending the responsibility preserves that Membership. A Dirigent from outside
  the Choir is the exception: appointing one adds Choir Membership, without a Section, for the tenure.
  Cancelling or swapping a planned Dirigent removes the Membership created for that appointment.
  Ending or changing prerequisite participation is refused if it would invalidate an appointment,
  unless the caller passes `endAppointments`, which a form does only after naming what will end.
- One Position has at most one holder in its context on a date. A person holds at most one
  Position in a particular Board at a time. Appointments in distinct contexts may coexist.
- Taking a Position ends Helper participation in its granted Groups when the tenure begins, and
  removes a Helper period planned for later. A Helper period that began within a backdated tenure
  refuses it, so that history is never rewritten. To resume Helper participation after the tenure,
  add a new Helper period.
- A change on the day something begins, when that day is not past, corrects it instead of leaving a
  record of a day: a Voice change, a removed member, a cancelled or swapped holder. Swapping a holder
  requires naming them in `replaces`, so one Admin never silently undoes another's choice.
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
`getGroupAuthorizationFacts` supplies complete contextual appointment periods, while
`lockGroupAuthorizationFacts` coordinates the User advisory lock and Group archive locks for
Events. `listMembershipsOfUser` supplies dated direct and appointment-derived Memberships for
Event audiences, including archived Groups and excluding periods ending at the requested boundary.
Admin commands authorize before parsing and again inside the transaction used by the command;
protected screen queries establish their own `org.manage` boundary.

Admin forms accept the inclusive last day and store the following day as the exclusive end.
Non-annual archival preserves dated participation and still allows corrections to ended periods.
Preparing an annual year creates its Groups without copying participation.

## Public interface

Import commands and reads from `@/features/org-structure`; fixed definitions and universal types
come from `@/core/org-structure`. The public interface is server-only.

Group workflows use `createOrganisationGroup`, `prepareOrganisationYear`,
`listOrganisationGroups`, and `updateOrganisationGroup`. Preparing a year creates its concrete
annual Groups without copying Members or appointments.

Direct Membership workflows use `addDirectMembership`, `changeDirectMembership`,
`correctDirectMembership`, `endDirectMembership`, `listDirectMemberships`,
`listDirectMembershipsOfUser`, and `listDirectMembersAt`. Singer placement commands
`startMembership`, `placeSinger`, `placeSingerInSection`, `changeVoice`, and `endMembership` use
the same direct Membership rules and preserve the explicit Section Voice.

Position workflows use `appointPosition`, `replaceAppointmentHolder`, `endAppointment`,
`cancelPreparedAppointment`, `correctAnnualAppointment`, and `correctFluidAppointment`. The
catalogue fixes each appointment's context type, prerequisite, grants, and annual or fluid end
policy. Each correction command validates the selected Position's policy and recomputes the
appointment's required target Groups. Effective reads derive participation from the updated appointment.

Use effective reads whenever a caller needs Group participation, rather than adding the direct
and appointed sides independently:

- `listEffectiveMembersAt`, `listEffectiveMembersCurrent`, and
  `listEffectiveMembersForGroupsAt` return one Membership per User and retain the appointments
  and context that provide Position membership.
- `listEffectiveParticipationOfUserAt` and `listEffectiveParticipationOfUserCurrent` show a
  person's Memberships and appointments together.
- `listEffectiveGroupsOfUserAt` shows the Groups a person belongs to on a date.
- `listEffectiveChoirAffiliationsOfUsersAt` provides dated Choir and Section summaries for
  multiple people.

Historical and future records are evaluated against the date supplied to the read. “Current”
reads use the same effective rules at today's date rather than equating a null end with permanent
participation.

## Migration and verification

The redesign migration requires an empty Group table and refuses retained Groups before any
schema or data changes. It drops the legacy participation and Position tables without converting
their records; Group and Section identities are recreated by reference seeding after the cutover.
Users, Posts and Post reads can remain when the organisation has been deliberately cleared.
The [Ops cutover guide](../../../scripts/ops/README.md#organisation-model-cutover) distinguishes
a whole disposable local reset from a reviewed cutover preserving unrelated data and accounting
for Event and other Group references. No automatic production cleanup or remapping is provided.

Database tests create, migrate, and drop disposable PostgreSQL databases using the local
`POSTGRES_URL`. Skipped database tests do not establish that migrations or constraints work.
The cutover tests cover refusal with unchanged legacy data/schema/ledger and migration of an empty
organisation followed by repeatable reference seeding with valid annual years. Enum renames
remain necessary because earlier migrations define the legacy PostgreSQL enum even without rows.
Reference seeding matches Sections by Choir and Voice and retains stable seed UUID tokens.

## Filling a year

`fillPosition`, `addGroupMembers` and `refillGigGroup` are the everyday commands behind the Admin pages.
The first person planned in the current or next year sets up all of that year's annual Groups; a finished
year is never set up. Reads in `roster-reads.ts` therefore list every Position and committee of a year
whether or not its Groups exist. `roster.ts` holds the universal rules both sides share: what counts as
vacant or missing, the default dates, and the one place a singer takes when CSK sings as one choir.

## Admin pages

Each page belongs to one future audience, so that access can later be given page by page; today all
of them are for Admins.

| Page | What it manages |
| --- | --- |
| Choirs and voices | Singers only: Sections and Voices, by Choir or as one choir. No Positions. |
| Board | Its eight Positions, a year at a time. |
| Choir Positions | Each Choir's Positions, the annual ones for this year and next, and Stämföräldrar. |
| Committees | Rosters, with Positions set elsewhere shown read-only, and other CSK-wide Groups. |
| Gig groups | Line-ups by Voice, saved as one refill, and Gigledare. |
| Group history | Corrections and past periods of any Group. |

Inactive Users are left out of current rosters, counts and pickers, and stay in a finished year. An
Inactive holder is shown as such with a way to replace them, because they still hold the Position.
Missing Voices, Choirs and holders are reminders and never refuse a change.
