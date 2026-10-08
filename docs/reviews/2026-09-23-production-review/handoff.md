# Start here tomorrow

The substantive review is complete. **Do not restart the review.** Read [the index](README.md), choose a finding, then read its canonical body and [the policy recommendation](access-control.md) if relevant. The review produced proposals only; no application fixes, issues, branches, migrations or existing documentation were changed.

## Snapshot and preserved work

- Repository: `/Users/liam/projects/csk/csk-hub`.
- Snapshot: **2026-09-23**, commit **`930a2a527b5f124e9a764b224f32994651a417b6`**, branch **`47-send-and-receive-a-message`**.
- Review directory: **`docs/reviews/2026-09-23-production-review/`**.
- Existing untracked `docs/reviews/README.md` and `docs/reviews/astra-codebase-review-prompt.md` were present before this session and preserved.
- Canonical findings: [authentication](authentication.md), [authorization/architecture/operations](architecture-operations.md), [notifications](notifications.md), [UI/runtime/i18n](ui-runtime.md). Each ID has one canonical body.
- [System map](system-map.md) contains package versions, workflow traces, documentation hierarchy, acceptable-inspection ledger and check results. Temporary `/tmp` files are not required to resume.

## Choose the next work

1. **Close public membership and origin holes first:** AUTH-001 (public OTP registration), AUTH-002 (reset tokens sent to unrelated Vercel tenants), OPS-001 (database TLS verification disabled). These can be small focused changes.
2. **Make identity/policy consistent:** AUTH-003 (email-only 2FA bypass), AUTH-004 (revoked cached sessions), AUTHZ-001 (native Admin policy bypass/final-Admin invariant), AUTHZ-002 (impersonation/private commands/credential powers). Follow the incremental sequence in access-control.md; do not wait for a sweeping refactor to close immediate holes.
3. **Fix external side effects:** NOTIFY-01/02 (endpoint trust and Inactive User recipients), then binding/outcome reconciliation (NOTIFY-03/04), with OPS-002's environment contract.
4. **Finish workflow and maintenance improvements:** password reset/2FA state, pending/error UI, local server boundaries, operational diagnostics, direct dependencies and canonical docs. Choose a coherent workflow, not an arbitrary number of findings.

The user must authorize implementation in the next task; this review request explicitly said to stop after the report. Selecting a finding is not permission to alter every related feature. Do not publish tracker messages or claim team approval of an ADR based on this review.

## Working rules for an implementation agent

- Check `git status` and compare `git diff 930a2a527b5f124e9a764b224f32994651a417b6 -- <affected paths>` before relying on an old finding. Include current unstaged/untracked work in that assessment. Mark changed conclusions stale until locally rechecked; preserve this dated snapshot and record resolution in the implementation PR or a new status note.
- Read AGENTS, CONTRIBUTING, CONTEXT and relevant module README/ADR. Read installed Next docs before changing Next code; installed versions outrank memory or newer public docs.
- Preserve **User, Admin, Invite, Inactive User, Erasure, Choir, Post, News feed, Conversation and Message** semantics. One association, three permanent Choirs; no speculative organizations/tenants. Every Admin is a User. Invite creates the User immediately. Inactive User storage through Better Auth ban fields is an intentional ADR.
- Keep exclusions: no Erasure investigation/redesign, migration review, rate-limit project, persistent audit infrastructure, translation wording critique, blanket test coverage or detailed future-feature design. Any necessary implementation scope expansion must be explicit.
- Read the chosen finding's facts, confidence, dependencies, acceptance criteria and limits before changing code. Keep feature ownership and existing messaging transaction/idempotency guarantees. Reuse pure policy and shaped read/command seams; avoid general-purpose frameworks or mechanical file splits.
- Make small, reviewable changes. Update canonical module docs when contracts change. Draft a short ADR when a meaningful decision changes; team discussion is still required before merge. Keep unmerged ADR references within the introducing branch/PR as CONTRIBUTING requires.
- Use proportional verification of the actual behavior: direct native auth handler tests for plugin holes; authoritative actor/policy tables; a disposable DB concurrency check for final Admin; fake push transport and browser binding scenarios; targeted UI tests for pending/recovery. Do not substitute hidden buttons for server enforcement.

## Verification status to carry forward

- **Passed:** nonincremental typecheck; Biome (308 files); `bun test ./src ./messages.test.ts --dots` (140 tests, 34 files, 265 assertions); bounded static import-direction/cycle check; 382-key catalog/ICU parity check.
- **Reproduced in isolation:** OTP self-registration, email-only session despite enabled 2FA, reset token callback to an unrelated Vercel tenant, cached identity after session removal, impersonated passkey registration challenge, push destination control, unsafe return-path normalization, duplicate FormApi submissions, environment mismatch and TLS downgrade.
- **Not passed/completed:** full Bun suite hit an architecture-test timeout; default Next/Turbopack build was terminated after 180 seconds at compilation. Do not report either as green. They ran in a disposable copy using synthetic configuration, not the user's actual environment.
- **Not exercised:** live DB/catalog/lock behavior, deployed cookie/header/origin setup, authenticated browser acceptance, actual WebAuthn enrollment, SMTP/push delivery, shared-browser service-worker lifecycle, keyboard/screen-reader/mobile layout and performance. The source review is complete at the stated depth; these are acceptance/verification gaps, not a request to redo it.

After authorized changes, run `bun run typecheck`, `bun run lint`, targeted tests and the normal build/checks appropriate to the touched boundary. Resolve or explain the full-suite/build result before claiming release readiness. Never run real seed or delivery commands merely to verify this review.

## Product decisions awaiting ratification

1. **Impersonation:** recommendation is support access with private Conversations and credential control excluded; current native Admin powers undermine that distinction.
2. **Recovery:** recommendation is no accidental email-only bypass of enabled 2FA. Any intended recovery exception needs an explicit protocol while preserving Invite activation.
3. **Push on shared browsers:** decide whether explicit logout revokes this browser's binding; revocation is recommended. Correct false Enabled/account-switch state regardless.
4. **Deployment contract:** exact app-owned preview origins, one environment precedence rule, real production email delivery, and whether local push setup is mandatory or optional.

No decision blocks understanding the immediate confirmed defects. Do not invent an answer silently when an implementation would materially change those product guarantees.
