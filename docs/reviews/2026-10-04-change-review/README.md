# CSK Hub change review — 2026-10-04

Read-only snapshot of `b5fd804b7c840bf76a45afe4667d2507d01b9b0d...031da8f8d6a9162834b1697ffb3f53bf0e4acd56`, branch `80-admin-groups`. The base is an ancestor of HEAD; direct and merge-base comparisons agree. Nine commits, 200 changed paths. Working tree was clean before and after inspection. The review phase made no application, configuration, migration, documentation, issue, branch, or generated-file changes and saved its original artifacts outside the repository. The user subsequently authorized this repository-local explorer; this directory is that follow-up artifact. Application source remains unchanged.

Open [the interactive codebase atlas](atlas.html), or serve the maintainable [viewer](viewer/index.html). The atlas embeds the pinned source, imports, workflow traces, review annotations and illustrative behavior models. See [viewer instructions](viewer/README.md) for rebuilding and previewing.

## Start here

The changed code has good feature locality, thin route modules, explicit server boundaries, and substantial domain verification. Passing checks nevertheless miss historical and concurrent group invariants, stale-session authority, and two UI correctness gaps.

Use the independent review tracks below. Findings are canonical here; their bodies are not duplicated in other files.

| Track | Findings | Highest severity | Suggested sequence within track |
| --- | --- | --- | --- |
| Standards | 4 | Medium | [STD-1](#std-1--reference-data-reruns-corrupt-renamed-sections), [STD-2](#std-2--different-holders-can-overlap-historically), then STD-3/STD-4 together |
| Spec | 2 | Medium | [SPEC-01](#spec-01--preserve-ordered-list-starting-numbers), [SPEC-02](#spec-02--bind-confirmation-to-the-holder-actually-replaced) |
| Production supplement | 3 | High | [PROD-1](#prod-1--revoked-cached-sessions-can-still-author-and-read-messages), then PROD-2/PROD-3 |

Standards and Spec were reviewed independently in parallel, as required by the code-review skill. Their findings remain separate. The production supplement records the primary reviewer's additional workflow analysis; it does not rerank the two axes.

## Scope, sources, and assumptions

This is a review of changes since the supplied commit, not a new audit of every pre-existing module. The supplied production review brief governs the review bar and exclusions. Sources: AGENTS.md, CONTRIBUTING.md, CONTEXT.md, docs/codebase-structure.md, docs/agents, ADRs, feature guides, the relevant installed sources, and GitHub issues/PRs #18, #47, #69, #77, #78, #79, #80, #81.

Revised scheme v3 and current CONTEXT vocabulary supersede earlier v2/issue wording about Voice and Part. Documented ops exceptions are intentional: direct ops writes are not themselves a violation. Account server logic that only received a form-component substitution is context, not a fresh full authentication audit.

Excluded: database migration review, GDPR Erasure, translation wording, blanket coverage auditing, rate-limit design, durable audit infrastructure, future product feature design, tenancy, and implementation. Tests may apply migrations to disposable databases; applying them is not an audit of their contents.

Installed versions checked: Next 16.3.5, React 19.3.0, Better Auth 1.7.4, Drizzle 0.45.2, next-intl 4.14.4, Base UI 1.8.0, Tiptap 3.31.3, TypeScript 7.0.2, Biome 2.5.13. Installed Next guides for `io`, Server Actions, and `revalidatePath` were read. No framework claim relies on an older remembered API.

## Compact system map

- `src/app/[locale]`: internal locale route topology; public URLs are rewritten without locale prefixes by `src/proxy.ts`. The authenticated layout composes navigation. New `/messages`, `/messages/new`, `/messages/[conversationId]`, `/admin/groups`, and `/admin/groups/[groupId]` routes delegate to feature entrypoints and suspend runtime reads.
- `src/core/auth`: Better Auth establishes sessions and coarse roles. Existing permission grants combine application Post resources with Better Auth admin resources. New messaging identity lookup uses `requireAuthenticatedUser`; route policy blocks support impersonation from messaging routes. Sending actions independently block impersonation.
- Messaging: UI actions → server-only `sending` → transaction and Direct Conversation membership → locked recipient → sender/key advisory lock → Conversation lock → sequence allocation, insertion, sender read cursor. Reads check pair membership; timelines use 50-message windows and signed read markers. Inbox uses lateral latest-message/unread queries.
- Org structure: UI actions → shared Admin guard and validation → transaction/savepoint commands. Commands own Groups, Choirs, Sections, Memberships, Positions, and holders; Voice contains/family rules are a separate universal feature. User advisory locks protect membership-related writes. Catalogue and holder operations currently have incomplete lock coordination.
- Posts: compose form → Post-specific document normalization → permission guard → JSONB insert. The reusable rich-text feature owns Tiptap configuration, browser editor, server React renderer, safe links, and one prose stylesheet. Read paths import the server renderer, not the editor.
- Database ownership: `core/db/schema/{auth,posts,messaging,org-structure,voice}`. Ops reference data/demo seed are explicit exceptions to normal feature write ownership. Operational tooling owns local/production target selection; application modules consume one configured database.
- Shared forms own labels, controls, errors and descriptions; shared Base UI wrappers own common controls. Core i18n owns locale cookies and selectors; account settings supplies persistence to the same selector. Email/push adapters and health/environment infrastructure received no substantive change in this range.
- Docs: AGENTS is the entrypoint, CONTRIBUTING controls ADR process, CONTEXT owns vocabulary, structural guide owns dependency/locality conventions, feature READMEs own external obligations, ADRs record decisions.

## Coverage and acceptable ledger

| Area | Pass | Inspected flows/files and result |
| --- | --- | --- |
| Architecture/dependencies/locality | Representative | New feature entrypoints, workflow folders, schema ownership, architecture tests, shared fields. No additional actionable structural smell. |
| Groups/domain/Drizzle/transactions | Deep | structure, membership, positions, linked-positions, lookup, operation, schema, real-DB tests. STD-1–4; typed results/savepoints and normal membership cascades are otherwise sound in sampled flows. |
| Groups Admin UI/privileged writes | Deep | overview, detail, catalogue, actions, queries, command dialog/runner. Guards, histories, archive toggle, Voice controls, translated failures present. SPEC-02. |
| Messaging/auth/read/write | Deep | sending commands, recipient checks, append locks, inbox/member search, pair reads, signed markers, composer/actions, route policy. PROD-1–3. Pair authorization, normalized body, sequence/idempotency persistence are acceptable by source and existing tests. |
| Rich text/Post runtime | Deep | schema normalization, safe-link allowlist, extension configuration, editor/form transport, server renderer/shared prose, parity tests. SPEC-01. React text rendering avoids raw HTML. |
| Account/auth forms and user management | Representative | Changed activation, login, reset, 2FA, password/passkey controls, language persistence, add/import forms. No regression found from field substitutions. Legacy session management, OTP generation, and impersonation target policy not comprehensively re-audited. |
| Next/React/browser behavior | Representative | Suspense routes, server/client boundaries, editor mount, locale optimistic rollback, theme hydration, pagination. PROD-2; live layout/browser/build remain unverified. |
| Basic accessibility/responsiveness | Pattern | Field labels/generated IDs, named buttons, translated controls, layout classes, shared primitives. No additional demonstrated defect; no visual certification. |
| Internationalization | Representative + check | Cookie contract, shared selector/persistence, time-zone wiring, typed strings; flattened key sets match in en/sv/de. No wording review. |
| Production errors/config/adapters | Changed-path pass | New actions/error mapping, reference-data/reset guards, session cache integration. PROD-1/3. Unchanged headers/env/email/push/health are context only. |
| Dependencies/dead code/docs | Representative | Installed versions, package additions, public imports, scripts, READMEs, CONTEXT, relevant ADRs/scheme. No exhaustive dependency/dead-code scan. Documentation notes below. |
| Migrations/Erasure/future features | Excluded | Intentional exclusions, not unfinished audit categories. |

## Standards

### STD-1 — Reference-data reruns corrupt renamed Sections

- Type: data-model issue. Severity: Medium. Confidence: Confirmed. Effort: M.
- Locations: `scripts/ops/reference-data.ts:109–112`, `src/features/org-structure/structure.ts:93`. Contract: `src/features/org-structure/README.md:15,22–23` says ops preserve exactly four non-overlapping Sections.
- Observation: Section existence is checked by mutable name. In disposable PostgreSQL, rename MKT1 and run `insertReferenceData`: MK acquires five Sections, two singing T1. The Admin rename operation is permitted. The command is documented as safe to rerun and can target production.
- Impact: ambiguous Section selection and incorrect choir structure can enter through ordinary administrative maintenance, bypassing the module's invariants.
- Recommendation/owner: ops reference-data must distinguish bootstrap from reconciliation and match established reference entities independently of display names. For Sections, Choir plus Voice identifies existing structure; validate four non-overlapping Sections before committing. Review parent Choir renames and catalogue customizations under the same rerun contract rather than restoring defaults silently.
- Tradeoff/dependencies: refusing ambiguous reconciliation is safer than guessing identities. Stable seed keys are an alternative with schema/design cost; no generalized organization model is needed. No prerequisite beyond choosing the rerun contract.
- Acceptance/verification: bootstrap still populates a fresh database; repeated runs after supported renames neither add duplicate Choirs/Sections nor overwrite administrator intent. Add a disposable-db regression for rename + rerun and assert four Sections/unique contained Voices. Existing invalid structures require explicit repair, not deletion of history.

### STD-2 — Different holders can overlap historically

- Type: data-model issue. Severity: Medium. Confidence: Confirmed. Effort: S.
- Locations: `src/features/org-structure/positions.ts:90–102`. Contract: `CONTEXT.md:105–108`, one holder per Position and Group at a time.
- Observation: interval conflict detection filters by incoming `userId`. Disposable PostgreSQL accepted A holding January–June and B starting in March in the same Group/Position. The partial unique index only prevents two rows with null end dates; it does not protect historical intervals.
- Impact: administrators can create contradictory organizational history while every command reports success.
- Recommendation/owner: org-structure Positions must check intervals across all holders of the office, and serialize that check with competing office writes. Preserve the existing convention that one period may end on the next period's start date.
- Tradeoff/dependencies: use transaction checks/locks within the current architecture; a database exclusion constraint is a future alternative, not a prerequisite. Coordinate lock choice with STD-3/4 and SPEC-02.
- Acceptance/verification: overlapping different-user periods are rejected with a typed failure; adjacent intervals remain accepted. Verify start, replacement, and linked holding paths against a disposable database, including concurrent starts.

### STD-3 — Catalogue revocation races with assignment

- Type: data-model issue. Severity: Medium. Confidence: Strongly probable. Effort: S.
- Locations: `src/features/org-structure/positions.ts:65–72,104`; `src/features/org-structure/structure.ts:176–203`. Contract: `org-structure/README.md:26`, the Group type must allow its held Position.
- Observation: catalogue revocation locks the Position row; assignment reads that row and the allowance without coordinating locks. Schedule: assignment reads Board allowance; catalogue update locks Position, sees no committed holder, removes Board allowance and commits; assignment subsequently inserts a holder. Its FK references Position identity, not the allowance.
- Inference/impact: both operations can succeed and leave a holder in a Group type where the Position is forbidden.
- Recommendation/owner: acquire a common Position lock before validating allowance and retain it through insertion; allowance add/remove operations must participate in the same protocol. Integrate the protocol with office and user locks.
- Tradeoff/dependencies: locks are preferable to broad transaction serialization for this small module. Follow one declared lock order (STD-4); don't merely add a late lock after the check.
- Acceptance/verification: controlled concurrent assignment/revocation produces either a valid assignment with rejected revocation or successful revocation with rejected assignment, never a disallowed persisted holder. Recheck the exact interleaving on PostgreSQL.

### STD-4 — Handover reverses the lock order

- Type: bug. Severity: Medium. Confidence: Strongly probable. Effort: M.
- Locations: `src/features/org-structure/positions.ts:42–56,27–31,130–135`; `src/features/org-structure/membership.ts:123`; `src/features/org-structure/operation.ts:56–58`.
- Observation: replacement locks the incumbent holder row before user advisory locks. Departure/end-holding acquires the user's advisory lock before updating that holder row. A replacement can hold the row while waiting on the user; departure can hold the user while waiting on the row. Sorting the users within replacement does not resolve this inversion.
- Inference/impact: PostgreSQL aborts one ordinary Admin command with a deadlock; it becomes `unexpected`, rather than a predictable reconciliation outcome. This also contradicts the local comment claiming the ordering prevents handover deadlocks.
- Recommendation/owner: org-structure must establish one global order for office/catalogue/user/holder locks across replacement, departure, simple holding commands, and linked positions. Consider an office advisory lock for vacancy/replacement coordination. Review Group share-lock upgrades in rename/archive while defining that order.
- Tradeoff/dependencies: bounded whole-transaction retries can improve resilience but do not substitute for a coherent lock protocol. Coordinate STD-2/3 and SPEC-02. PostgreSQL recommends consistent lock acquisition order; see [official locking guidance](https://www.postgresql.org/docs/current/explicit-locking.html).
- Acceptance/verification: a controlled incumbent departure versus replacement race terminates without lock inversion, preserving member/holder invariants. Repeat for end-holding and opposing handovers; failures are typed or explicitly retried, not indefinitely retried.

No additional actionable judgement-call smell was found in structural sampling. Documented conventions override generic smell heuristics; tools already enforce many mechanical rules.

## Spec

### SPEC-01 — Preserve ordered-list starting numbers

- Type: bug. Severity: Medium. Confidence: Confirmed. Effort: S.
- Location: `src/features/rich-text/view/rich-text-content.tsx:82`.
- Requirement: [issue #18](https://github.com/herr-ek/csk-hub/issues/18), “The editor and the rendered output are visually indistinguishable to a reader.”
- Observation: Tiptap's ordered list stores `attrs.start`, including Markdown typing such as `5. `. Normalization preserves it; the server renderer emits `<ol>` without `start`. The spec review's disposable rendering comparison observed editor start 5 and reader HTML with no start attribute.
- Impact: a published rota/list changes its numbering from what its author saw.
- Recommendation/owner: rich-text/view must preserve supported, validated ordered-list start attributes. Keep editor configuration, normalization, and renderer consistent.
- Tradeoff/dependencies: one attribute mapping is enough; replacing the renderer or editor is unnecessary. No dependencies.
- Acceptance/verification: a list beginning at 5 remains 5 in editor, feed and permalink. Extend the existing meaningful parity assertion to check the attribute; tag-only comparison cannot catch this defect.

### SPEC-02 — Bind confirmation to the holder actually replaced

- Type: bug. Severity: Medium. Confidence: Strongly probable. Effort: M.
- Locations: `src/features/org-structure/ui/detail/positions-section.tsx:118–123`; `ui/detail/actions.ts:80–98`; `positions.ts:42–58`.
- Requirement: [issue #80](https://github.com/herr-ek/csk-hub/issues/80), “Confirm before doing this.”
- Observation: replacement wording uses page-loaded holder data; submitted fields contain no expected holder identity/version. The command ends whichever holder exists when it runs. If A loaded a vacant Position and B fills it first, A's ordinary Assign silently ends B's holding. An occupied stale page can confirm the wrong person's departure.
- Impact: a legitimate Admin unknowingly removes another Admin's intervening assignment.
- Recommendation/owner: group-detail transport plus org-structure replacement must carry and compare the expected holder version, including an explicit vacancy. Compare inside the same serialized command that performs the replacement. A mismatch returns a translated conflict and requires refreshed confirmation.
- Tradeoff/dependencies: use the holding identity/start date or another concrete revision, not only user identity, since one person can end and restart a holding. Integrate STD-2/3/4 lock changes; avoid doing a separate preflight check followed by an unprotected write.
- Acceptance/verification: vacancy→occupied and holder A→holder B between page load and submit cannot silently replace. A current explicit confirmation still produces the intended adjacent dated handover.

Other sampled requirements were implemented: archive visibility, membership/holding history, Voice picker restrictions, guarded routes/actions, translated command failures, shared controls, theme/language changes, rich-text allowlists, safe links, and server rendering. No additional scope-creep finding is asserted for documented vocabulary and ops decisions.

## Production supplement

### PROD-1 — Revoked cached sessions can still author and read Messages

- Type: security risk. Severity: High. Confidence: Strongly probable for the full application flow; installed-library cache behavior Confirmed. Effort: M.
- Locations: new `src/core/auth/session.server.ts:23–27`; `src/features/messaging/sending/send-message.ts:13–26`, `start-direct-conversation.ts:15–57`, `direct-recipient.ts:48–61`; `ui/conversation/query.ts:16`. Existing enabling context: `src/core/auth/auth.ts` cookie cache (300 seconds) and `src/proxy.ts:17` cached session lookup.
- Observation: the new identity guard accepts any returned session, without disabling cookie cache or checking the sender's active record. Sending locks/checks the recipient only. Better Auth 1.7.4's installed `api/routes/session.mjs` can return signed cached session data without consulting session rows; its Admin ban operation marks the User and deletes sessions. A disposable database reproduction with the same cookie-cache setting returned an authenticated cached session after banning its User/deleting its session, while `disableCookieCache: true` returned null.
- Inference/impact: a recently deactivated User retaining valid cookies can continue reading private conversations and sending to active Users during the remaining cache lifetime. A previously revoked impersonated session can similarly retain stale context. The cache itself predates the range; this finding concerns new messaging trust boundaries built on it. [Better Auth session documentation](https://better-auth.com/docs/concepts/session-management) documents cache bypass and revocation behavior.
- Recommendation/owner: core/auth should provide a fresh request actor for protected feature reads/writes. Messaging must authorize an active sender and recipient, not just membership plus cached identity. Bypass cache for the authority decision; lock/check relevant current User records in a consistent order for send-versus-deactivation races. Keep route checks as UX, with enforcement at the actual read/command boundary.
- Tradeoff/dependencies: fresh verification adds database work, acceptable for this internal application. Disabling caching globally is simpler but affects all sessions; a fresh guarded actor seam is narrower. Preserve Better Auth's session/identity responsibility and messaging's membership responsibility. No library migration is required.
- Acceptance/verification: obtain a real cached session, deactivate/revoke it elsewhere, then replay its cookies against conversation read and both send paths: no read/write succeeds after authoritative revocation. Also verify concurrent sender deactivation, recipient deactivation, expired sessions, and active users. The existing `session-cache.test.ts` proves the cache premise, not the complete Next action exploit.

### PROD-2 — Sending from an older timeline window hides the sent Message

- Type: bug. Severity: Medium. Confidence: Strongly probable. Effort: S.
- Locations: `src/features/messaging/ui/conversation/query.ts:42–64`, `screen.tsx:55–62,120`, `message-composer.tsx:24–28`, `actions.ts:24–26`.
- Observation: Load older replaces the route with `?before=N`. The composer remains enabled. A successful send revalidates and scrolls the displayed pane, but neither action nor composer removes `before`; the read query continues excluding the new sequence. There is no latest/newer control within this screen. Revalidation rerenders the current route; it is not navigation to different search parameters. See installed Next's Server Actions and revalidatePath guides.
- Inference/impact: the member sends successfully, loses the submitted draft, and sees no sent Message in the current Conversation pane. This is especially misleading in long histories.
- Recommendation/owner: conversation UI should navigate to the latest canonical window after successful sending from history, or expose an explicit latest control and restrict the composer to that view. Preserve a useful back/history behavior.
- Tradeoff/dependencies: changing the success navigation is the smallest fix; continuous bidirectional history is larger and unnecessary. No dependencies.
- Acceptance/verification: with more than 50 Messages, load older, send, and see the returned Message once in the latest timeline. Browser verification should cover normal send, history send, failure preserving draft, and back navigation.

### PROD-3 — Unexpected send failures lose operational diagnostics

- Type: readiness gap. Severity: Medium. Confidence: Confirmed. Effort: S.
- Locations: `src/features/messaging/ui/message-command-result.ts:8–18`, conversation/actions.ts catch, inbox/actions.ts catch; contract `src/features/messaging/sending/README.md` Error and retry behavior.
- Observation: both send actions catch database/programming errors and map them to `unexpected`; neither logs them. The shared converter discards the exception. The sending guide says observability retains the original error, but no logging occurs at this boundary. The groups/Post adapters already demonstrate the repository's operational logger pattern.
- Impact: a database outage, constraint surprise, or send deadlock yields a generic member error with no actionable server event for diagnosis.
- Recommendation/owner: messaging UI transport should log unexpected failures once using the existing logger, with command identity and sanitized error metadata. Keep expected validation/access failures quiet and member-safe.
- Tradeoff/dependencies: basic operational events suffice; no Message content, tokens, cookies, or persistent business audit trail. No dependencies.
- Acceptance/verification: inject an unexpected persistence failure and verify one server event plus the translated generic client result. Expected access/validation failures do not produce error noise, and sensitive content is absent from events.

## Access-control recommendation

Retain coarse User/Admin roles; Positions are organizational concepts, not authorization roles. Better Auth should establish identity, freshness, and impersonation context. A small application-owned policy layer should answer domain questions; keep database membership/target reads in feature-owned boundaries. This is an architectural direction, not a request to redesign unchanged user management during these fixes.

Target actor: `{ userId, roles, impersonatedBy }`, obtained through a fresh server-only resolver. Pure policy names should describe intent: `canManageUsers(actor)`, `canInviteUser(actor)`, `canChangeUserRole(actor, target)`, `canActAsUser(actor, target)`. Messaging additionally needs member/resource policies and the explicit support-impersonation restriction. Do not accept an actor identity from FormData. UI checks are affordances; actions, route handlers, privileged reads, and mutations must enforce independently.

| Option | Fit and cost |
| --- | --- |
| Small app-owned predicates | Recommended for demonstrated User/Admin, target, membership, and impersonation checks. Clear domain names; minimal integration. Requires deliberate review of every enforcement boundary. |
| Existing Better Auth access-control grants | Keep for plugin admin capabilities and existing coarse resource/action grants. Wrap behind domain policies when appropriate; it does not by itself encode current membership or target-specific invariants. |
| CASL | [Official project](https://github.com/stalniy/casl) supports resource conditions and subject-level authorization. Useful if several real conditional policies emerge; introduces subject/rule translation, a second policy vocabulary, and query integration work. Those costs are not justified by this diff. |

Migration shape: introduce the fresh actor seam for PROD-1, add a few pure policies, migrate one workflow at a time, then align route/UI affordances with the same policy. Preserve the existing permission denial contract while deliberately distinguishing unauthenticated, forbidden, invalid target, unavailable resource, and unexpected service failure. Avoid broad catch-to-forbidden behavior for new service failures. Enforce impersonation restrictions at the owning capability boundary, even if current callers already guard routes/actions. Existing impersonation target behavior was not comprehensively audited here.

## Documentation recommendations and exploration

- Keep CONTEXT canonical. The scheme document has a superseded v2 before v3; add a short top-level link to v3 or split the historical draft from the current spec in an authorized implementation/documentation pass. The current feature README correctly identifies v3.
- Two new files use ADR number 0005. Unique identifiers would improve references; rename/update introducing-branch references together under CONTRIBUTING's ADR process. This is a low-impact note, not an independent correctness finding.
- Update the org-structure guide with the chosen lock order and reference-data reconciliation contract after fixes. Update the sending guide to describe actual fresh-actor and error-observation behavior.
- Keep useful focused feature guides; there is no evidence that every README needs splitting. Do not duplicate findings in future issues/artifacts.
- To explore: an office-level transaction seam could hide historical interval checks, holder replacement/version checks, and lock ordering together. Its value is concrete in STD-2–4/SPEC-02; avoid exporting locks or requiring UI callers to assemble transactions.
- To explore: enforce the documented ops write exception with a small invariant-validation step instead of duplicated module logic. Sharing a universal domain validator can preserve dependency direction; moving the whole application feature into ops dependencies is not required.

## Validation and limitations

- `bun run lint`: passes, 396 files checked, no fixes applied.
- `bun tst` under the sandbox: 212 pass / 102 skip; local database sockets were unavailable.
- Same suite with local PostgreSQL access: 304 pass / 0 fail, 580 assertions, 51 files. All database fixtures were disposable and dropped. Dynamic test registration explains differing totals; do not combine counts across runs.
- Group reproduction: one additional disposable-db test confirmed renamed Section duplication and overlapping different-user holding periods. Evidence script: [groups reproduction source](evidence/groups-evidence.txt) (original `groups-evidence.test.ts`).
- Session-cache reproduction: one test, four assertions, passes; disposable database dropped. Evidence script: [session-cache reproduction source](evidence/session-cache.txt) (original `session-cache.test.ts`). It uses installed Better Auth's relevant cache setting, not the entire production auth/plugin configuration.
- Rich-text reproduction: spec reviewer compared normalized JSON, installed editor DOM specification, and server HTML; nondefault ordered-list numbering is lost.
- `tsc --noEmit --incremental false` using normal repo configuration fails in `.next/{dev/,}types/validator.ts:107` because stale generated validators reference deleted `messages/new-group/page.js`. This is local generated state, not a source regression finding.
- A temporary config ([tsconfig-source.json](evidence/tsconfig-source.json)) excludes those generated validators and sets absolute local type roots: source typecheck passes. It does not replace a fresh full framework-generated typecheck.
- Flattened translation key sets agree across en/sv/de. ICU rendering was not exhaustively tested.
- No build/dev server/browser run: these regenerate repository state, which this pass preserves. Consequently hydration, responsive layout, real transport replay, older-window success navigation, and locale rewrite/cache behavior need proportional implementation-time verification. Concurrency findings have concrete source schedules, not controlled runtime reproductions.
- No formal certification or exhaustive security/dependency/coverage claim. Unchanged auth, health, environment, email/push, and security headers are not declared fully audited.

## Decision log, questions, and implementation handoff

Decisions: review the supplied commit range; preserve a clean repository; put artifacts in `/private/tmp`; honor explicit exclusions; use current vocabulary and documented ops exceptions; keep Standards and Spec independent; label source-derived race findings as probable. No blocking product question arose. Choose the reference-data rerun/reconciliation behavior during STD-1; the necessary outcome is preservation of valid structure and administrator edits. Clarify whether members should compose from history when resolving PROD-2; returning to latest after success is a reasonable default.

Future implementation agent: choose one finding or the linked lock/holder cluster, read its canonical body first, and preserve product vocabulary and exclusions. Make incremental changes at the stated owning boundary. Do not re-review the whole repository. Add targeted regression verification for the demonstrated defect; update the relevant guide/ADR only when the decision requires it and follow the introducing-branch ADR reference rule. Run proportional lint/typecheck/tests and use a disposable DB for temporal/concurrency cases. Refresh generated Next types and run a production build only in an authorized implementation pass; verify the affected browser flow then. Do not create issues, publish decisions, or implement speculative product features without the user's instruction.

Continuation: read this file and inspect `git diff 031da8f8d6a9162834b1697ffb3f53bf0e4acd56...HEAD` plus working-tree changes before reusing conclusions. Mark findings stale where relevant files changed. The diff review is complete at the recorded representative/deep coverage; optional remaining validation is the controlled STD-3/4 race reproduction and actual Next/browser flows listed above. Full legacy-auth/operational/dependency auditing would be a separate expanded scope. The original `/private/tmp` artifacts have been copied into this durable review directory in the authorized explorer follow-up. Reproduction sources are stored as `.txt` so ordinary repository test discovery does not execute them.
