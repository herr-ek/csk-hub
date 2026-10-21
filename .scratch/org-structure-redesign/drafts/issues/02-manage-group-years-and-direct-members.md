# 02: Manage annual Groups and fluid direct Memberships

**What to build:** Let an Admin prepare a concrete year's Groups and manage explicitly added members according to each Group type's scope and lifetime. Deliver working Group list, creation, detail, and direct-member flows against the new model, with applicable translations and command/read tests.

**Blocked by:** 01: Expand the organisation model without changing live behaviour.

**Status:** implemented and verified on the integration branch — 2026-10-21

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 6, 7, 8, 9, 10, 15, 18, 19, 20, 35, 36, 38, 46, 47, 48, 51.

- [x] An Admin can prepare annual Groups for 26/27 and 27/28 as distinct concrete Groups, with the required annual set available before appointments are made.
- [x] Preparation is atomic and idempotent, and never copies or renews any members or appointments.
- [x] Admin screens allow editing a concrete Group's name, applicable fixed type, scope, and year; dependent records are updated consistently or an actionable typed refusal explains what must be handled first.
- [x] Direct Membership editing supports current, historical, and prepared future dates and applicable singer-placement corrections, preserving history for ordinary changes and offering an explicit correction flow for mistakes.
- [x] Existing annual and fluid records can be found and edited through the Admin UI without direct database access; tests verify public reads after a valid edit and unchanged data after an invalid edit.
- [x] Annual direct Memberships end after 30 June; a September joiner still belongs to that year's Group.
- [x] Current and historical lists distinguish future, current, and completed annual Groups by date rather than a null Membership end or free-text name.
- [x] Arkivariet, Webmästeriet, Valberedningen, and Utantillkommittén support explicit annual members without formal Position assignment.
- [x] Sexmästeriet, Turnékommittén, Konsertmästeriet, Gigmästeriet, and Rekryteringskommittén allow explicit Helpers.
- [x] Board and Föräldramötet direct additions are refused in both the interface and public commands.
- [x] Roddgrupp, festgrupp, and rephelgsgrupp require a Choir and allow at most one current Group of each type per Choir; their members have no forced annual expiration.
- [x] Several gig groups can coexist, all CSK-wide, with fluid direct Membership.
- [x] Choir and Section placement continues to preserve four non-overlapping Sections, Voice containment, and one singing Section per Choir.
- [x] The existing generic Övrig case retains direct-member compatibility without granting formal Positions or bypassing known type policies.
- [x] Admin guards, typed rule violations, year/last-day inputs, and relevant copy work in every supported locale.
- [x] Public command/read tests cover late joins, July boundaries, future preparation, scope/cardinality refusals, and helper additions; a real browser check demonstrates annual Group preparation.


## Implementation notes

Implemented in commit `0f4007f` (`Manage annual Groups and dated direct Memberships`).

- Added atomic, idempotent preparation of all ten annual Groups, with explicit year identity and date-derived current/future/completed phases. Preparation preserves existing identities and never copies Memberships or appointments.
- Added concrete Group metadata editing. Occupied structural changes return `group-has-participation` without partial writes; names remain editable. Choir-team cardinality checks both legacy and new-model Groups under a shared lock, including concurrent creation/reclassification.
- Added public dated direct-member/Helper addition, ordinary period changes, explicit corrections, ending, history reads, and date-evaluated reads. Annual Memberships default to an exclusive 1 July end; forms show and accept an inclusive last day. Fluid participation has no forced annual deadline.
- Added singer-placement validation and correction, preserving Choir coverage, Voice containment and non-overlapping Sections. Legacy departure and archival paths cannot strand new-model dependencies. Board and Föräldramötet refuse direct additions in commands and UI.
- Added discoverable Admin management of current, prepared and historical direct records. Retained legacy singer/fluid records have an explicit correction flow. Unresolved legacy annual Groups refuse new additions/date corrections with translated guidance to prepare/select a concrete Group or reconcile the year first; no legacy year is inferred from a name.
- Added English, Swedish and German copy and narrow-screen badge wrapping. Appointment management, complete effective-roster consumer cutover and populated legacy conversion remain with the subsequent tickets; this is still an integration-branch slice, not the final model cutover.

## Verification

- Full suite: **493 passed, 0 failed**, across 76 files; database tests ran against real disposable PostgreSQL databases with no database skips.
- Typecheck: `bun run typecheck --incremental false` passed. Lint: `bun run lint` passed. Production build: `bun run build` passed, including all three locale variants.
- Command/read coverage includes September joins, 30 June/1 July boundaries, prepared years, idempotency, atomic rollback, no participation copying, metadata corrections/refusals, Helper additions, scope/cardinality policies, race handling, singer corrections and prerequisite protection.
- Admin action coverage includes guards, invalid input, inclusive last-day conversion, typed refusals, unchanged data and no cache invalidation on refusal, and refusal of unclassified annual additions.
- Real browser against a disposable database: prepared 26/27 and 27/28, added an annual direct member with the preset 30 June last day, refused an occupied Group's year change, recovered with a valid name correction, and verified English/Swedish/German controls and a 390 px viewport. Next.js reported no compilation/runtime errors.
- Code review: **Standards — 0 unresolved findings; Spec — 0 unresolved findings.** The repeated transfer rule was consolidated; cross-model Choir-team cardinality and unresolved legacy annual-addition bypasses were fixed and regression-tested.
