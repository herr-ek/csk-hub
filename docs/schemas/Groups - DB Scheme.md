# Groups database schema

This is the final schema for organisation Groups, direct Memberships, and Position appointments.
The fixed business catalogues live in `src/features/org-structure/model/catalogue.ts`; this
document describes the database shape and which invariants are enforced there.

SQL identifiers below are the actual PostgreSQL table and column names. User IDs are text; Group,
Membership, appointment, and Section IDs are UUIDs. Dates are PostgreSQL `date` values.

## Groups

`group_type` is the enum stored by `group.type`:

```text
Choir, Section, Board, GigGroup, Gigmästeri, Sexmästeri, Roddgrupp, Festgrupp,
Rephelg, Konsertmästeri, Rekryteringskommitté, Turnékommitté, Valberedning,
Webmästeri, Föräldramötet, Arkivarie, Utantillkommitté, Övrig
```

`group` stores the concrete identity: `id`, editable `name`, fixed `type`, optional `choir_id`,
`active`, and optional `organisation_year`. Annual Groups each have their own identity and year;
there is no compatibility marker. `choir` is a one-to-one extension for Choir Groups.
`section` is a one-to-one extension for Section Groups and stores the Section's `voice`.

The database enforces nonblank names, the allowed year range, Choir/Section parent shape, fixed
scope and annual-year rules, and the relevant unique identities: active names are unique within
their Choir (including CSK-wide Groups), annual Group type/year is unique, Föräldramötet has one
continuing identity, and at most one active Roddgrupp, Festgrupp, or Rephelg of each type exists
per Choir. The feature also protects fixed Choir/Section structure and the rest of the catalogue
rules. Groups are archived by setting `active` false; foreign keys preserve referenced identities.

## Participation tables

```text
direct_membership (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES group(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NULL,
  voice voice_division NULL
)

position_appointment (
  id uuid PRIMARY KEY,
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

`direct_membership` is independent participation, such as singer placement or a Helper period.
`position_appointment` is the single dated tenure in a fixed Position and context. The
`appointment_grant` rows connect that appointment to its required concrete Groups. They contain
no duplicate User, Position, year, or date fields: those remain properties of the appointment.
Some definitions grant Membership in the context Group itself (for example, a Board office); some
grant other Groups as well; choir and Section leadership may rely on a pre-existing direct
Membership and grant no context Membership of their own.

`direct_membership` periods and `position_appointment` periods use half-open date ranges:
`[start_date, end_date)`. A null end denotes an open period. Empty or reversed periods are
rejected. Annual periods start no earlier than 1 July of their `organisation_year` and end no
later than 1 July of the next year; that next 1 July is excluded. Admin forms show the inclusive
last day, 30 June. Fluid appointments have no organisational year and no inferred June boundary.

## Database constraints and feature rules

PostgreSQL enforces non-overlap for a User's direct Memberships in the same Group, one
appointment holder per Position and context at a time, and the Board rule that one User holds at
most one Board Position at a time. Group policy checks validate direct-membership eligibility,
annual bounds, Section Voice containment, appointment code/context/year, and that each grant
targets an allowed Group type and year. A grant to a Position's context type must point to that
exact context Group. Group references use restricted deletion so Group identity is preserved;
User references cascade on User deletion, and deleting an appointment cascades its grants.

The organisation feature adds rules that require coordinated reads and writes: complete required
grant sets, continuous direct-Membership coverage for Choir, Section, and GigGroup prerequisites,
Helper-to-appointment conversion, explicit re-addition after ending an appointment, valid
Choir/Section placement coverage, and archival protection. Use the public
`@/features/org-structure` commands rather than writing these tables directly. Seed scripts are
the operational exception and validate their fixture relationships before insertion.

Some database constraints use PostgreSQL exclusion constraints or triggers and are written in
hand-maintained migrations because Drizzle does not represent them. Preserve those definitions
when regenerating a migration; the named constraints and functions are maintained in the SQL
migration alongside the generated schema snapshot.

## Voice types

`voice` is a PostgreSQL enum containing the four families (`S`, `A`, `T`, `B`) and eight
divisions (`S1` through `B2`). `voice_family` and `voice_division` are domains over that enum.
`section.voice` uses `voice`; `direct_membership.voice` is set exactly for Section Memberships
and uses `voice_division`. A trigger checks that the singer's division is contained in the
Section's Voice. `voice_capability(user_id, voice)` has a composite primary key and uses
`voice_division`; it records self-reported ability independently of Group Membership.

## Migration and reset

Migrations preserve the repository's committed migration history and build the final schema from
an empty local database. The configured local database is disposable for this redesign; the
authorized workflow is `bun run ops reset` followed by `bun run ops seed-demo`. Reset is local-only
and clears data before applying migrations and reference data. No legacy-data conversion, audit
ledger, or production reset is part of the workflow.
