# Organisation structure management

This feature owns the reads, commands, and management UI for Groups, Memberships, and
appointments. The [core organisation module](../../core/org-structure/README.md) owns the
fixed catalogues, policies, and universal domain types that these workflows apply. The domain
language is in the [root glossary](../../../GLOSSARY.md#groups), and the final table layout is described in
the [Groups database schema](../../../docs/schemas/Groups%20-%20DB%20Scheme.md). Voice families,
divisions, and containment belong to the separate [Voice feature](../voice/README.md).

## Domain model

A Group is either CSK-wide or belongs directly to one Choir. A Choir is itself a CSK-wide Group;
each Choir has four Sections. Group types and Position codes are fixed in the universal
`@/core/org-structure` catalogue. Annual Groups are separate concrete identities for
each Organisational year. Their dates run from 1 July through 30 June. Fluid Groups have no
automatic annual renewal.

Membership is a person's dated participation in a Group. Direct Membership records an explicit
period, such as singer placement or Helper participation. A Position appointment is one person's
tenure in a fixed Position and a specific context Group. Its catalogue definition determines
which Groups receive dated Membership through it; that set may include the context, other Groups,
or both. For example, an Ordförande appointment grants its Board context, while Sexmästare in the
Board grants both the Board and Sexmästeri. Three Choir Konsertmästare can each belong to the same
year's Konsertmästeri while retaining their own Choir contexts. These Memberships are derived
from the catalogue, context, and year by one shared query; no grant rows are stored. The current
catalogue applies to historical appointments too; there are no versioned policy snapshots.

Annual periods use an exclusive 1 July end boundary in stored dates. Admin forms display and
accept the inclusive last day, 30 June. An annual appointment ending on that boundary is not
renewed automatically; a continuing holder receives an explicit new appointment for the next
year. Fluid appointments end only when an Admin changes or ends them.

## Invariants at the module boundary

Application code writes organisation tables through this feature and uses its focused reads for
Membership and Position information. The `scripts/ops` seed commands are the deliberate writer
exception; they create stable local examples and validate the same relationships before writing.
Database clients may be passed directly or as part of a caller's transaction, so a larger command
can make its changes atomic.

The feature protects these relationships:

- A Section belongs to one Choir, and a singer has at most one overlapping Section Membership in
  a Choir. Section Voice must contain the singer's Voice division, and the Choir Membership must
  cover the Section Membership.
- A Position's context Group has the type fixed by its Position code. Appointment grant Groups
  (including the context where defined) and the annual year come from that code; callers do not
  choose a separate set of Memberships.
- Choir, Section, and GigGroup appointments require the person's direct Membership in the context
  for the entire appointment. The appointment does not enrol its holder in that prerequisite
  Group, and taking or leaving the Position preserves that independent Membership.
- One User holds at most one Position in a particular Board at a time. A Position has at most one
  holder in its context at a time. Other appointments may overlap when their contexts differ.
- A direct Helper period in a group with a formal Position ends when the person takes that
  Position. Ending the appointment does not silently restore the earlier Helper Membership; an
  Admin must explicitly add the person again.
- Board and Föräldramötet do not accept direct Membership. Section Voice is required and valid on
  Section Membership; other Groups have no singer Voice field.
- Groups are archived rather than deleted. Archival is refused while current or future
  appointments still depend on the Group.

Appointment creation, correction, handover, and ending update the appointment and any
affected direct Memberships atomically; derived participation follows those records. A refusal leaves the affected participation unchanged. Commands serialize
conflicting changes so simultaneous appointments cannot bypass the same holder or prerequisite
rules.

## Public interface

Import commands and reads from `@/features/org-structure-management`; fixed definitions and universal types
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

## Fixed catalogue

The catalogue contains Ordförande, Vice Ordförande, Kassör, Sekreterare, PR-mästare,
1:a Konsertmästare, CSK Gigmästare, Sexmästare, Sexmästarinna, Ekonomiskt Ansvarig, Dirigent,
Notfiskal, Choir Konsertmästare, Choir Gigmästare, Stämförälder, and Gigledare. Position identifiers and the rules that give them meaning are code-controlled; labels are
translated using English intl keys. There is no runtime editor for creating
another formal Position. Groups such as Valberedningen, Webmästeriet, Arkivet, and
Utantillkommittén use direct Memberships where no formal Position was agreed.

## Database tests

The organisation tests use a freshly migrated disposable PostgreSQL database created from the
local `POSTGRES_URL`, then drop it. A skipped database test is not evidence that a migration or
constraint works; run the relevant suite with local PostgreSQL available when changing this
feature.


## Group labels

Annual Groups, Choir teams, and the parents meeting store no name. The core naming policy
and database check enforce this; rename commands refuse derived names. Choirs, Sections,
GigGroups, and Other Groups keep explicit names. Presentation reads use
`listLocalizedGroupLabels` for a viewer-localized label, including context choices and member
profiles. The formatter includes the annual year or owning Choir exactly once. Domain reads
remain locale-independent and expose nullable explicit names alongside stable identities.
