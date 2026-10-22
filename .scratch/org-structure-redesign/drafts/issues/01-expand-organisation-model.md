# 01: Expand the organisation model without changing live behaviour

**What to build:** Introduce the shared representation and fixed catalogues needed to express an annual Group, a direct Membership, and one appointment granting participation in several Groups. This is the deliberate foundation exception to behaviour slicing: the same representation affects every writer and reader, so expand it before migrating the workflows. Keep existing application behaviour usable until the coordinated cutover.

**Blocked by:** None (can start immediately after plan approval).

**Status:** complete — implemented and reviewed on `db-groups-restructure` (2026-10-20)

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 37, 41, 42, 44, 45.

- [x] The fixed Group policy and 16 Position definitions match the spec, including separate CSK and Choir Gigmästare identities and retained Gigledare.
- [x] The new appointment representation persists fixed Position codes without requiring a new editable Position catalogue table; retirement of the legacy Position table is part of ticket 08.
- [x] Annual Group identity can be stored explicitly; appointment context is distinct from granted Group Membership.
- [x] The new representation stores one tenure per appointment and grant connections without independent User, Position, or tenure copies.
- [x] Named additive migrations preserve committed migration history, legacy data, and existing foreign references while later conversion is prepared.
- [x] The public organisation boundary accepts the existing database-or-transaction form and translates applicable new constraint failures into typed violations.
- [x] Occupancy and period constraints support bounded and future tenures, vacancies, and independent same-title Choir contexts; meaningful race tests prove uniqueness.
- [x] A read-only reconciliation inventory identifies unsupported Position names, ambiguous years, duplicate singleton Groups, partial linked holdings, and unclear direct-member intent before writes.
- [x] The inventory does not merge records based solely on a matching title or User, and does not modify data.
- [x] Disposable PostgreSQL migration and command/read smoke tests demonstrate the new representation while existing callers still compile.
- [x] Any temporary compatibility adapter has an explicit removal point in ticket 08; no new user-facing configuration or permission concept is introduced.


## Implementation

- Foundation commit: `7565e00` (`Expand organisation schema with single appointments and reconciliation inventory`); review fixes and this completion record follow on the same branch.
- Added fixed Group policies and all 16 stable Position definitions, explicit Group years, independent `direct_membership`, single-tenure `position_appointment`, and connection-only `appointment_grant`.
- Added named migration `0017_expand-organisation-appointments`, preserving migrations 0000–0016 and all existing records/references. PostgreSQL exclusions cover dated occupancy, Board exclusivity, and direct Membership overlap; policy triggers validate scope, annual bounds, Voice, and grant targets.
- Added database-or-transaction commands `createOrganisationGroup` / `appointPosition`, dated grant read `listAppointmentMembersAt`, and typed constraint translation. The appointment command resolves the fixed grant set atomically and accepts continuous prerequisite coverage across adjacent Membership periods.
- Added public read-only `inventoryOrganisation` and `bun run ops organisation-inventory`. The CLI uses a repeatable-read, read-only transaction. Candidate years, titles and possible pairs remain review evidence; the report never approves a merge or modifies data.
- Replaced the superseded versioned schema document with one description aligned with the actual code/migration, covering both the additive model and retained legacy tables.

## Verification

- `POSTGRES_URL=<disposable-local-postgres> bun test --dots`: **476 passed, 0 failed, 0 skipped**, across 74 files; 2914 assertions. PostgreSQL ran on a separate temporary cluster, and each integration fixture used a disposable database.
- Focused command/read, race, reconciliation, and populated-legacy migration checks passed. The migration fixture verifies retained holding IDs/history, Event foreign references, old Voice triggers, read-only inventory execution, CLI JSON, and repeat migration.
- `bun run typecheck`, `bun run lint`, and `git diff --check`: passed.
- `bun run db:generate --name=verify-organisation-schema`: no schema drift and no extra migration generated.
- `bun run build --webpack`: passed, including TypeScript and all 100 static pages. Default Turbopack build remains blocked by this environment's worker-port binding restriction (`Operation not permitted`), including an elevated attempt.
- Two-axis code review against starting commit `bd4827cd07a2100bc907259283473fd366b85d89`: Standards and Spec findings resolved and independently rechecked. Fixed prerequisite coverage across adjacent periods; clarified public input contracts and module-guide wording. No outstanding findings on either axis.

## Transition limits

This is the shared persistence foundation, not the coordinated production cutover. Existing application commands, live reads, editable legacy catalogue, and seeds retain their behaviour. No development or production database was reset or converted.

`uses_appointment_model` is an internal compatibility marker; the legacy command/read split and marker have an explicit removal point in ticket 08 after migration of every caller. Tickets 02–07 deliver annual preparation/direct-member workflows, Helper conversion, lifecycle/departure/archival protections, effective Membership consumers, translated Admin flows, and reviewed legacy conversion. Parent-update revalidation of stored grant connections belongs with those lifecycle operations; this ticket exposes appointment creation only. The inventory does not resolve uncertain legacy intent automatically.
