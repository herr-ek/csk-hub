# 07: Seed a faithful redesigned organisation

**What to build:** Create rich reference and demo data for the agreed fixed organisation, with valid Membership and single-appointment examples. The user explicitly made the local database disposable and requested reset/reseed; legacy conversion is superseded.

**Blocked by:** 06: Show effective Membership and scoped Positions to every existing consumer.

**Status:** complete — rich seed implementation and stable-reference review fix merged on `implement/org-structure-redesign` (`a3dc427`, `c79f2e1`), actual PostgreSQL acceptance verified (2026-10-21).

**Spec:** [Positions and Groups Redesign](../../spec.md), including its disposable-database execution override.

- [x] Fresh reference data creates MK, DK and KK with twelve valid Sections, the continuing Föräldramötet, and complete concrete annual Group sets for current and prepared years.
- [x] Demo data supplies 100 usable singers with varied valid Voice and Choir/Section history; preserves existing auth and news Post examples.
- [x] Board examples demonstrate a vacancy, handover, late appointment, explicit same-person annual renewal, and independent Choir duties.
- [x] The shared Konsertmästeri and Gigmästeri combine all three Choir representatives with the appropriate Board office, retaining separate context identities.
- [x] Helpers, Helper-to-appointee history and explicit re-addition, Sexmästarinna, Turné financial responsibility, Secretary/Section parents, and ordinary direct committees are represented without invented formal titles.
- [x] Fluid Conductor, Music Librarian and Gig Leader duties retain independent prerequisite Membership, including history and future examples without invented June deadlines.
- [x] Stable seed identities and rerun checks preserve public corrections to Membership dates/Voice and appointment holder/context without duplication or overwriting edits.
- [x] Real fresh PostgreSQL migration/reference/demo/idempotency checks, typecheck and lint pass; seed instructions describe the redesigned examples.

## Scope revision

The user's 2026-10-21 instruction supersedes the original legacy reconciliation criteria. No preview/apply CLI, conversion audit ledger, preserved-data cutover, or legacy mapping fixtures are required. Earlier conversion drafts and review notes remain outside the integration branch. Root will execute the explicitly authorized configured-local reset and complete reseed after ticket08 supplies the final schema.

**Evidence:** Seed-only changes committed as `b98a1a5` and merged into integration at `a3dc427`. `bun run lint` and `bun run typecheck` passed. Fresh disposable PostgreSQL seed/reference suite passed 12 tests across `scripts/seed-groups.test.ts`, `scripts/seed-demo.test.ts`, and `scripts/ops/reference-data.test.ts`. No configured database reset was run by this ticket.

## Seed identity review follow-up

A fresh PostgreSQL reproduction renamed DK through the public command, then reran reference/demo seeding. Reference seeding created a second DK and four Sections (47→52 Groups), and demo seeding failed for missing prerequisite Membership. Stable reference identity must survive editable names; the rerun criterion is reopened until fixed. Evidence: `/private/tmp/csk-org-review-seed-identity.log`. Existing Membership/appointment correction-rerun tests remain valid. Luna06 owns the fix on `implement/org-seed-identity-fix`; final runtime retirement proceeds separately.

## Seed identity follow-up resolved

Fix `8739c1f`, merge `c79f2e1`, gives Choirs, Sections and Föräldramötet stable reference identities and seed lookups independent of editable names. Thirteen real PostgreSQL seed/reference/demo tests pass (720 assertions), including renamed Choir/Section/continuing Group preservation and public Membership/appointment corrections. Typecheck and full lint pass. Parent reran the original public rename reproduction on integration: reference rerun creates nothing, demo rerun succeeds, Group count stays 47 (`/private/tmp/csk-org-review-seed-identity-fixed.log`). The fake activity label is no longer counted as a created Group. All eight revised criteria are checked again.
