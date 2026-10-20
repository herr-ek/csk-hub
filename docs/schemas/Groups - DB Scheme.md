# Groups database schema

This describes the schema implemented in `src/core/db/schema/org-structure.ts` and
`src/core/db/schema/voice.ts`, including the hand-written constraints in migrations
0011, 0013, and 0017. Migration 0017 is the additive foundation of the organisation
redesign. Both representations below currently exist. Legacy application behaviour,
reference data, IDs, history, and foreign references remain available; no conversion
runs as part of this migration.

## Groups, Choirs, and Sections

SQL identifiers below are the actual database names. Group IDs are UUIDs; User IDs
are text. All dates on participation records are PostgreSQL calendar dates.

```text
group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type group_type NOT NULL,
  choir_id uuid NULL REFERENCES choir(group_id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  organisation_year integer NULL,
  uses_appointment_model boolean NOT NULL DEFAULT false
)
choir (
  group_id uuid PRIMARY KEY REFERENCES group(id) ON DELETE RESTRICT
)
section (
  group_id uuid PRIMARY KEY REFERENCES group(id) ON DELETE RESTRICT,
  voice voice NOT NULL
)
```

A Choir is itself a CSK-wide Group. A Section belongs directly to a Choir. Other
Groups are CSK-wide or Choir-owned according to their policy. There is no deeper
hierarchy. Groups are archived rather than deleted by application commands.

`organisation_year = 2026` identifies 26/27: `[2026-07-01, 2027-07-01)`.
An annual Group is a separate concrete Group for each year. Names are editable and
do not determine operational identity. A null year means no annual identity, or an
unreconciled legacy Group. Non-null years are restricted to integers 1000–9998.

`uses_appointment_model` is an internal transition marker, not an Admin option.
New model Groups set it true and enforce the fixed year/scope/cardinality policy.
Existing Groups retain false; their names and dates are not interpreted or changed
by the migration. Redesign ticket 07 reconciles them. Ticket 08 removes the marker,
legacy tables and commands after every writer and reader has migrated, and applies
the reconciled rules universally.

Database constraints:

- Names must contain non-whitespace characters.
- Active names are unique within a Choir, including one CSK-wide namespace:
  `(name, choir_id) NULLS NOT DISTINCT WHERE active`. This remains the hand-written
  index from migration 0011.
- A Choir has null `choir_id`; a Section has non-null `choir_id`.
- For model Groups, the policy trigger requires an explicit year exactly on annual
  types and requires Choir ownership exactly on Choir-scoped types.
- Model annual identity is unique by `(type, organisation_year)`, including archived
  Groups. Model Föräldramötet is unique by type, including archived Groups.
- Active model Roddgrupp, Festgrupp and Rephelg are unique by `(type, choir_id)`.
- The existing application commands create a Choir and its four non-overlapping
  Sections together. The extension-table iff/type relationship and four-Section
  requirement are application rules, not database constraints.

## Fixed Group policy

`GROUP_POLICIES` in the universal organisation model is authoritative for new
commands. The database policy functions in migration 0017 freeze the same policy
for storage checks. A later policy change needs both a code change and an additive
migration; Drizzle does not generate trigger changes.

| Stored group_type | Scope | Lifetime | Direct Membership | Cardinality |
| --- | --- | --- | --- | --- |
| Choir | CSK | Continuing | Yes | Existing MK, DK, KK; managed by Choir commands |
| Section | Choir | Continuing | Singer placement | Four per Choir; managed by Choir commands |
| Board | CSK | Annual | No | One per year |
| Gigmästeri | CSK | Annual | Helpers | One per year |
| Sexmästeri | CSK | Annual | Helpers | One per year |
| Konsertmästeri | CSK | Annual | Helpers | One per year |
| Rekryteringskommitté | CSK | Annual | Helpers | One per year |
| Turnékommitté | CSK | Annual | Helpers | One per year |
| Valberedning | CSK | Annual | Yes | One per year |
| Webmästeri | CSK | Annual | Yes | One per year |
| Arkivarie | CSK | Annual | Yes | One per year |
| Utantillkommitté | CSK | Annual | Yes | One per year |
| Föräldramötet | CSK | Continuing | No | One continuing Group |
| Roddgrupp | Choir | Fluid | Yes | At most one active per Choir |
| Festgrupp | Choir | Fluid | Yes | At most one active per Choir |
| Rephelg | Choir | Fluid | Yes | At most one active per Choir |
| GigGroup | CSK | Fluid | Yes | Multiple |
| Övrig | CSK | Fluid | Yes | Multiple; compatibility case |

`Arkivarie` retains its existing enum identifier for Arkivariet. Övrig confers no
formal Positions; the inventory flags every unclassified Group for explicit review.
Existing legacy Groups can still have scope outside the new policy until reconciled.
Annual periods permit preparing next year's Groups. The intended operational rule
that only one Turnékommitté operates at a time belongs to later lifecycle workflows;
0017 stores annual identity without automatically activating or renewing anything.

## New participation representation

```text
direct_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES group(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NULL,
  voice voice_division NULL
)
position_appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  position_code text NOT NULL,
  context_group_id uuid NOT NULL REFERENCES group(id) ON DELETE RESTRICT,
  organisation_year integer NULL,
  start_date date NOT NULL,
  end_date date NULL
)
appointment_grant (
  appointment_id uuid NOT NULL REFERENCES position_appointment(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES group(id) ON DELETE RESTRICT,
  PRIMARY KEY (appointment_id, group_id)
)
```

A direct Membership is independent participation: singing, an explicit addition, or
helping. An appointment is one User's responsibility in one concrete context, with
one tenure. A grant connects that appointment to a concrete Group. It has no copy of
the User, Position, year or dates. The context does not itself imply Membership.

New periods use inclusive start and exclusive end. Ending after 30 June is stored
as 1 July. Null end means unbounded, not necessarily current. A future start is not
current early. Both participation tables require `end_date > start_date` when set.

Hand-written PostgreSQL `btree_gist` exclusions enforce overlapping ranges for:

- One appointment per `(context_group_id, position_code)` at any time.
- One simultaneous Board Position per `(context_group_id, user_id)`. The predicate
  contains the eight fixed Board Position codes below.
- One direct Membership per `(group_id, user_id)` at any time.

These checks include bounded, historical and future periods. Adjacent periods may
share a boundary; vacancies require no placeholder rows. Independent Choir contexts
can hold the same Position code simultaneously and grant the same committee.

Policy triggers enforce:

- A recognised `position_code` and matching context Group type.
- An annual appointment has a year, an exclusive end, and stays within that year;
  an annual context must have the same year. Fluid appointments have null year.
- Direct Membership is forbidden in Board and Föräldramötet. Annual direct
  Membership requires the Group's explicit year and stays inside its bounds.
- Voice is set exactly on Section direct Memberships and is contained by that
  Section's Voice. Non-Section direct Memberships have null Voice.
- A grant targets a model Group of an allowed type. A grant to the context type
  targets that exact context Group. Annual grant targets match the appointment year.

Indexes additionally support direct Membership lookup by Group, appointment lookup
by User, and grant lookup by Group. Foreign keys retain their referenced identities.

## Fixed Position catalogue

These are the 16 stable `position_code` values. Labels are not database identities.
An annual context supplies its year; Choir annual appointments require an explicit
year. Every annual end defaults to the following 1 July and may be shortened.

| position_code | Position | Context | Prerequisite | Granted Groups | End policy |
| --- | --- | --- | --- | --- | --- |
| ordforande | Ordförande | Board | None | Context Board | Annual |
| vice-ordforande | Vice Ordförande | Board | None | Context Board; year's Rekryteringskommitté | Annual |
| kassor | Kassör | Board | None | Context Board | Annual |
| sekreterare | Sekreterare | Board | None | Context Board; Föräldramötet | Annual |
| pr-mastare | PR-mästare | Board | None | Context Board | Annual |
| forsta-konsertmastare | 1:a Konsertmästare | Board | None | Context Board; year's Konsertmästeri | Annual |
| csk-gigmastare | CSK Gigmästare | Board | None | Context Board; year's Gigmästeri | Annual |
| sexmastare | Sexmästare | Board | None | Context Board; year's Sexmästeri | Annual |
| sexmastarinna | Sexmästarinna | Sexmästeri | None | Context Sexmästeri | Annual |
| ekonomiskt-ansvarig | Ekonomiskt Ansvarig | Turnékommitté | None | Context Turnékommitté | Annual |
| dirigent | Dirigent | Choir | Context Membership | None | Fluid |
| notfiskal | Notfiskal | Choir | Context Membership | None | Fluid |
| choir-konsertmastare | Choir Konsertmästare | Choir | Context Membership | Year's Konsertmästeri | Annual |
| choir-gigmastare | Choir Gigmästare | Choir | Context Membership | Year's Gigmästeri | Annual |
| stamforalder | Stämförälder | Section | Context Membership | Föräldramötet | Fluid |
| gigledare | Gigledare | GigGroup | Context Membership | None | Fluid |

CSK Gigmästare and Choir Gigmästare are separate identities. The latter's Choir is
its context, not a separate title per MK/DK/KK. Demo-only titles are absent.
Appointments confer no application permissions.

## Retained legacy representation

These tables remain unchanged in migration 0017. Existing application callers keep
using them until their coordinated migration; they do not automatically read or
write the new participation tables.

```text
group_member (
  user_id text REFERENCES user(id) ON DELETE CASCADE,
  group_id uuid REFERENCES group(id) ON DELETE RESTRICT,
  start_date date NOT NULL, end_date date NULL, voice voice_division NULL,
  PRIMARY KEY (user_id, group_id, start_date)
)
position (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL)
group_type_position (
  type group_type NOT NULL,
  position_id uuid REFERENCES position(id) ON DELETE RESTRICT,
  PRIMARY KEY (type, position_id)
)
position_group (
  position_id uuid REFERENCES position(id) ON DELETE RESTRICT,
  group_id uuid REFERENCES group(id) ON DELETE RESTRICT,
  PRIMARY KEY (position_id, group_id)
)
position_holder (
  user_id text REFERENCES user(id) ON DELETE CASCADE,
  group_id uuid REFERENCES group(id) ON DELETE RESTRICT,
  position_id uuid REFERENCES position(id) ON DELETE RESTRICT,
  start_date date NOT NULL, end_date date NULL,
  PRIMARY KEY (user_id, group_id, position_id, start_date)
)
```

All primary-key columns are non-null. Legacy Membership and holding periods allow
`end_date >= start_date`, including zero-length history. Legacy current reads mean
`end_date IS NULL`. Partial unique indexes enforce one current Membership per
User/Group and one current holding per Group/Position. They do not enforce all
bounded-period overlaps. Position names are unique and nonblank; Group names are
nonblank. Additional indexes support legacy Group membership/holding and Position
restriction reads. Legacy Voice triggers remain intact, including division checks.

Legacy commands require Membership, enforce catalogue applicability and optional
Group restrictions, serialize User changes, and close local holdings on departure.
Linked legacy commands create separate holding rows; no shared appointment identity
can be recovered from those rows without reconciliation. These behaviours are
preserved, not attributed to the new model.

## Voice models

`voice` is a PostgreSQL enum: S, A, T, B, S1, S2, A1, A2, T1, T2, B1, B2.
`voice_family` and `voice_division` are domains over `voice`, restricted to families
and divisions respectively. `voice_division` is restricted to the eight divisions. Section
Voice can be a family or division. Singer Voice and Voice capability use divisions.
`voice_capability(user_id text, voice voice_division)` has a composite primary key
and references User with `ON DELETE CASCADE`; it is independent of Membership.
The family and containment functions live in the universal Voice model.

## Public boundary and remaining cutover work

The server-only organisation boundary continues to accept a database client or an
existing transaction. Commands use a transaction/savepoint and translate applicable
new constraint failures into existing typed `OrgStructureViolation` results. Unknown
infrastructure errors still throw. New errors reuse existing translations.

The additive foundation exposes `createOrganisationGroup`, `appointPosition`, and
`listAppointmentMembersAt`. Appointment creation checks prerequisites for the entire
tenure and resolves mandatory grants by fixed type and concrete year atomically.
A missing target refuses the command without partial rows. The dated read deduplicates
people and retains every appointment/context; it reads appointment grants only.
The focused server-only `reconciliation` entrypoint also supports operational reads.

`bun run ops organisation-inventory` uses a repeatable-read, read-only transaction.
It reports supported Position candidates, explicit/name-derived year evidence,
duplicate singleton Groups, scope problems, unclassified Groups, holding context and
restriction evidence, possible linked pairs and partial periods, conflicting
Memberships, and unclear direct-member intent. Names, matching Users and dates never
approve a merge. Even paired candidates require review before conversion.

Later tickets deliver direct-member workflows and placement protections, Helper
replacement, prerequisite-shortening/departure protections, whole-appointment ending,
handover and renewal, archival protections, effective direct-plus-grant reads and
consumer migration, translated Admin flows, and explicit legacy reconciliation.
Those are not database guarantees or live behaviours introduced by ticket 01.
Only after that cutover does ticket 08 remove the legacy representation and marker.
