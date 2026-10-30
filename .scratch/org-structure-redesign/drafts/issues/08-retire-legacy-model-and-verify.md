# 08: Retire independent holdings and verify the complete redesign

**What to build:** Finish the appointment model across application, operations, documentation and database, then reset and richly reseed the disposable configured local database as explicitly requested by the user. Existing-data conversion and staged retirement are superseded; preserve committed migration history and verify a fresh final schema.

**Blocked by:** 07: Seed a faithful redesigned organisation. Independent retirement work may proceed alongside seed refinement; final acceptance waits for ticket07.

**Status:** implementation committed as `deebb7c` on `implement/org-ticket08`; root owns final integration review and configured-local migration/browser verification (2026-10-21).

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 4, 18, 37, 38, 39, 40, 43, 44, 45, 46.

- [x] All application and ops writers and readers have migrated before legacy holding, catalogue, restriction, and linkage structures or commands are removed.
- [x] The final schema enforces all required constraints without the compatibility marker or legacy catalogue; fresh migrations succeed.
- [x] The runtime Position catalogue editor and its mutation actions are removed or replaced with a read-only explanation of the fixed catalogue.
- [x] The old Position definition, holdings, Membership, applicability, restriction and linkage tables/commands are removed; appointments reference hard-coded Position codes.
- [ ] Final review verifies full Admin editing and correction flows for Groups, direct Memberships, and appointments, including historical and future records, while fixed catalogue definitions and domain invariants remain enforced.
- [x] Old per-Group start/end and caller-supplied linked-holding paths can no longer create a disconnected copy of an appointment.
- [x] Committed migration history is retained; a freshly migrated database runs the final application and rich reference/demo seeds successfully. Legacy-preservation fixtures are superseded.
- [x] The schema document becomes one coherent current specification, and the glossary and organisation module guide describe the implemented interface and invariants.
- [x] A concise proposed ADR records the single-appointment and granted-membership choice where the repository's ADR criteria apply; references stay on the introducing branch until merged.
- [ ] English, Swedish, and German copy is complete and consistently distinguishes Position from a news Post.
- [ ] Required lint, type, build, domain, consumer, migration, seed, and Admin-action checks pass; actual PostgreSQL execution is reported separately from skipped tests.
- [ ] The agreed real browser workflows pass against the running application, using the installed Next.js guidance for runtime verification.
- [ ] Review the full integration diff against both repository conventions and the local spec; fix findings and verify that temporary adapters, stale exports, and superseded catalogue assumptions are gone.
- [ ] Reset the configured local database and seed the new organisation; verify its counts, domain examples and usable Admin login. Record branch and actual checks. Do not deploy, publish or merge to master.


## User-authorized reset scope (2026-10-21)

The user explicitly stated that the local database is disposable and requested reset/reseed. No legacy reconciliation, conversion audit, guarded preserved-data retirement, or operator staging is needed. Reset is authorized for the configured local database through the existing local-only ops command; production is outside scope.

## Configured-local execution evidence

Root ran the user-authorized `bun run ops reset --yes` and `bun run ops seed-demo` against `localhost:5433/csk_hub` after seed merge `a3dc427`. Actual counts: 100 users, 47 Groups, 231 direct Membership periods, 39 appointments, 33 grants, 24 Posts. Public reads confirm MK/DK/KK plus the Board office in Konsertmästeri, 13 Secretary/Section-parent duties, and an empty current roster for the prepared Board. Seeded Admin login succeeds in the Swedish browser. Root will repeat the reset/reseed and browser verification after the final migration. Evidence: `/private/tmp/csk-org-configured-seed-audit.json`.

## Ticket 08 implementation evidence

Runtime/schema retirement is committed as `deebb7c` on `implement/org-ticket08`, based on integration `ae8b948`. Drizzle generated migration `0018_retire-legacy-organisation-model.sql` with aligned snapshot/journal; the hand-maintained SQL keeps invariant triggers and replaces marker-dependent checks with unconditional checks. A fresh disposable PostgreSQL cluster migrated and ran the full suite: 452 passed, 0 failed, 2113 assertions. Typecheck and lint both exit 0; `drizzle-kit check` and `git diff --check` pass. The schema guide was cross-checked against migration 0018 with no discrepancies. Root's full integration review, configured-local reset/reseed, build, and post-migration browser verification remain pending.

## Documentation progress

The docs branch replaces the legacy organisation module guide, removes conversion/audit steps from
the ops guide, updates Group-domain terms and Voice storage language, and adds a clearly proposed
ADR. The schema guide is based on the final table and constraint shape confirmed by the runtime
implementer. Documentation accuracy follow-up clarifies that correction validates the selected
Position policy and that User references cascade while Group references are restricted. A final
cross-check against the committed migration remains pending.

## Final review in progress

Two independent current-model reviewers examined `bd4827c...2416510`: Standards found 2 documented breaches and 1 duplication heuristic; Spec found 3 P2 workflow gaps (Choir departure, selected-year annual dates, archived sibling placement). Reports are recorded in [review.md](../../review.md). All corrections are assigned to one Luna implementer. Root reproduced the annual-year date mismatch in the actual seeded browser; final review acceptance remains unchecked until fixes and runtime re-verification pass. Root integrated checks so far: 452 actual PostgreSQL tests, 0 failures, 2113 assertions, typecheck passes; lint exits 0 with 15 warnings targeted for cleanup.
