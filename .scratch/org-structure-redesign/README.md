# Positions and Groups: local implementation plan

History rewrite (2026-10-30): the implementation is rebased on `master`, keeps the feature at
`src/features/org-structure`, and uses the consolidated migration
`0018_redesign-organisation-appointments`. Execution notes below describe the previous
unmerged history, including intermediate migrations that have now been replaced.


**Status:** implementation in progress — authorized 2026-10-21. Tickets 01–07 implemented and verified; ticket 08 is in progress. Final integrated verification remains pending.
**Scope:** complete the approved spec on `implement/org-structure-redesign`; local Markdown tracker only.
**Tracker:** local Markdown under this directory, overriding GitHub for this feature only.

Start with the [spec](spec.md). It is the build instruction and contains the complete fixed Group and Position catalogues, lifecycle rules, migration policy, testing boundaries, and scope. Then read the relevant ticket and its blockers.

## Review

The proposed main test boundary is the existing public organisation commands and read helpers against disposable PostgreSQL. Supporting checks exercise Admin Server Actions, existing member-service consumers, actual migration/seed behaviour, and three high-value browser workflows: annual Board handover and correction, the mixed-Choir Konsertmästeri, and fluid responsibility changes. These flows include editing existing records and recovering from refused edits, not only creating assignments.

Admins have full application flows to create, edit, correct, end, renew, and manage scheduled or historical organisation data within the agreed domain rules. Position definitions and Group type rules remain hard-coded; the old editable Position table is removed at final cutover. Tickets 02–05 own the editing workflows, ticket 06 connects management and member-facing displays, and ticket 08 checks the completed surface.

The user authorized implementation on 2026-10-21 with the existing test boundaries and dependency graph. Tickets 01 and 02 were already implemented and verified.

The individual ticket files remain in `drafts/issues` to preserve existing context pointers. Their Status fields are authoritative; the directory name reflects the earlier planning phase. Retain one file per ticket and update its status and verification evidence during execution.

## Dependency graph

| Ticket | Complete outcome | Blocked by |
| --- | --- | --- |
| 01 | [Expand the organisation model without changing live behaviour](drafts/issues/01-expand-organisation-model.md) | None |
| 02 | [Manage annual Groups and fluid direct Memberships](drafts/issues/02-manage-group-years-and-direct-members.md) | 01 |
| 03 | [Appoint, replace, and renew annual Board members](drafts/issues/03-appoint-and-renew-board-members.md) | 02 |
| 04 | [Bring every Choir's representatives into shared annual Groups](drafts/issues/04-compose-choir-representatives.md) | 03 |
| 05 | [Manage fluid responsibilities without changing singer Membership](drafts/issues/05-manage-fluid-responsibilities.md) | 03 |
| 06 | [Show effective Membership and scoped Positions to every existing consumer](drafts/issues/06-use-effective-memberships-everywhere.md) | 04, 05 |
| 07 | [Seed a faithful redesigned organisation](drafts/issues/07-reconcile-legacy-data-and-seeds.md) | 06 |
| 08 | [Retire independent holdings and verify the complete redesign](drafts/issues/08-retire-legacy-model-and-verify.md) | 07 |

Ticket 01 is the shared persistence/configuration foundation for a coordinated model refactor. Tickets 02–06 deliver end-to-end behaviours, and tickets 07–08 reconcile and contract the representation. Work on one integration branch; intermediate migrations are not separate deployment instructions.

The two independent branches after ticket 03 are tickets 04 and 05. Ticket 06 waits for both. Tickets 01 and 02 are complete. Ticket 03 is the initial remaining frontier; a ticket is runnable only when its blockers are implemented.

## Context for a fresh session

- Use the [local spec](spec.md) and the approved local issues as the execution contract. They supersede the old group-local holding model for this effort.
- For terminology, read [the glossary](../../GLOSSARY.md).
- For the agreed domain and proposed schema, read [the schema document](../../docs/schemas/Groups%20-%20DB%20Scheme.md); its lower v2/v3 sections still describe the old implementation and must not override the agreed redesign.
- For current command shape, transaction handling, and test prior art, read [the organisation module guide](../../src/features/org-structure/README.md).
- Read [CONTRIBUTING](../../CONTRIBUTING.md) and its task-specific guides before editing implementation. Follow root AGENTS.md and the relevant installed Next.js guides when writing application code.
- Existing related discussion is [GitHub issue 106](https://github.com/herr-ek/csk-hub/issues/106). It is background only; do not update it or publish local plan artifacts to GitHub.
- Local plan files and the glossary/schema edits remain in the current working tree. Carry them into the implementation checkout before changing sessions or worktrees; do not assume uncommitted files are present in another checkout.
- Once the plan is approved, a fresh session can use the implement-spec skill with this spec and its local issues, or implement one ready ticket at a time. The resulting code still needs review against this spec before shipping.

## Completion

Planning is complete when the test boundaries and breakdown have been approved and the individual local issues are ready-for-agent. Implementation is complete only when all approved issues meet their acceptance criteria and the final integration checks in ticket 08 pass.


## Execution log

- 2026-10-21: Resumed from `0f4007f`; tickets 01 and 02 are complete. Created integration branch `implement/org-structure-redesign`. Ticket 03 assigned in an isolated worktree to `gpt-6-luna`; orchestration, merging and review use the current model. The instruction to run implement-spec approves the existing test boundaries and ticket graph. No GitHub publication, live conversion, deployment or data reset is authorized.
- Baseline verification: 493 tests passed, 0 failed, no skips on a fresh isolated PostgreSQL cluster. Browser fixture database created separately; no existing development database changed.
- Cutover exploration: `/private/tmp/csk-org-cutover-notes.md` records source coverage, staged migration, guarded retirement, seed and fixture requirements for tickets 07/08.
- Consumer exploration: `/private/tmp/csk-org-consumer-notes.md` maps existing public read contracts, profile/directory visibility, Group views and cache invalidation. No Event audience runtime consumer exists at baseline `0f4007f`.
- Ticket 03 merged as `a9e918d` (implementation `86dabea`): 32 command/action DB tests, typecheck and lint passed. Tickets 04 and 05 started in parallel Luna worktrees.
- Integrated ticket03 full suite: 501 passed, no failures/skips. Browser creation/refusal recovery/correction/handover passed; identical Board+Sexmästeri appointment and July expiry confirmed through public reads. Browser-found dialog overflow fixed in `c5e1ba2`, merged `b02e63b`, and reverified at short/mobile sizes.
- Ticket04 merged as `494b875` (implementation `7a0c36b`): 18 actual PostgreSQL appointment tests, typecheck/lint passed. Ticket05 now merging that tip before combined validation.
- Resumed after workspace-credit interruption at integration `494b875`; ticket05 continues its in-progress merge. Disposable PostgreSQL fixture retained, development server restarted on 3011. No completed work restarted.
- Ticket04 browser check passed: MK/DK/KK representatives plus 1:a Konsertmästare coexist in the same annual Konsertmästeri with context labels and management links; clean Next runtime.
- Ticket05 merged as `32d6c1c`, including fluid catalogue filtering, future cancellation and distinct translated labels. Ticket06 assigned to Luna from that tip.
- User-requested ticket03 checkbox audit completed: all 17 acceptance criteria checked, supported by fresh public-boundary PostgreSQL audit and prior tests/browser evidence. Ticket03 status is complete; whole-spec review remains ticket08.
- Ticket05 acceptance follow-up merged as `2d8b91d`: 25 PostgreSQL tests pass, typecheck/full lint pass. All05criteria verified/checked, including parent browser evidence. Ticket06 review follow-up moves transitional unions/grant metadata into org public reads before integration.
- Ticket06 merged as `197394b`, with universal dated participation DTOs, single consumer interpretation, real directory/overview batching and current/date boundary fixes. 64 PostgreSQL target tests, typecheck and full lint pass. Ticket 07 assigned to Luna; parent browser review06 remains underway.
- Ticket06 browser verification complete: Admin profile/history/date display/navigation, ordinary-member privacy/action visibility, and directory Choir/Section summaries pass. Ticket06 checklist/status now complete. Display follow-up merged as `73b9558`.

- Additional parent review confirmed overlapping Helper addition and archived historical appointment correction gaps; saved concrete PostgreSQL reproduction in `/private/tmp/csk-org-review-lifecycle.log`. Reopened ticket03 historical-editing criterion pending final fix. Swedish Board UI smoke passed alongside earlier English/German checks; Next compilation/runtime remain clean.

- Lifecycle review fixes merged as `13845c5` (`d4b65d2`). Archived Board+Sexmästeri historical correction and archived Group name editing passed in the Swedish browser; public reads confirm exact corrected boundary and shared appointment identity. Helper overlap is now refused; server cancellation date is authoritative. Ticket03 all 17 criteria checked again.
- Ticket 07 core checkpoint `de813f8` plus integration merge `ca34a2e` and lint cleanup `3c57642` pass 28 relevant PostgreSQL tests, typecheck and lint. Supplemental conversion/refusal fixtures assigned to a separate Luna worktree before final acceptance.

- User scope revision: configured local database is disposable; existing-data reconciliation and conversion are superseded. Rich seeds and fresh final migrations replace the prior conversion plan. Explicit reset/reseed is authorized and will run after the final schema is ready. Unmerged reconciliation drafts/audit migrations are excluded. Tickets07/08 and spec execution override updated.

- Configured local database reset/reseed completed at `localhost:5433/csk_hub` using `bun run ops reset --yes` then `bun run ops seed-demo`, as explicitly requested. Verified 100 users, 47 Groups, 231 direct Membership periods, 39 appointments, 33 grants and 24 news Posts. Public dated reads verify the mixed-Choir Konsertmästeri, 13 Föräldramötet responsibilities, and no early prepared-year Board membership. Seeded Admin login succeeds in the actual browser (`singer-001@example.com`, local demo password `password`). Final retirement migration and full review remain pending ticket 08.

- Seed identity review fix `8739c1f` merged as `c79f2e1`: 13 actual PostgreSQL tests/720 assertions pass, typecheck/lint pass. Parent reproduction confirms public DK rename plus full rerun preserves 47 Groups and succeeds. Ticket 07 all eight revised criteria complete again.
- Ticket 08 runtime/schema cutover committed as `deebb7c` on `implement/org-ticket08`, based on integration `ae8b948`. Generated migration 0018 drops the transitional tables and marker, and applies unconditional policy/grant triggers while preserving current appointment, Voice and exclusion constraints. Fresh disposable PostgreSQL full suite: 452 passed, 0 failed, 2113 assertions; typecheck/lint, `drizzle-kit check`, and diff check pass. Docs agent cross-checked the schema guide against the migration. Root final integration review, configured-local reset/reseed, build and post-migration browser verification remain pending.
