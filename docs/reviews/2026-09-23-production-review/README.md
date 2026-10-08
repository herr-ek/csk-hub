# CSK Hub production review — 2026-09-23

**Substantive review complete; implementation not started.** Snapshot: `930a2a527b5f124e9a764b224f32994651a417b6`, branch `47-send-and-receive-a-message`. This review contains **23 actionable findings: 1 Blocker, 9 High, 12 Medium, 1 Low**. Confidence and reproduction limits are stated per finding; this is not formal certification.

**Continuing tomorrow? Read [the handoff](handoff.md) first.** It records exactly what remains and how to implement selected work without repeating this review.

## Executive summary and start here

The feature-oriented architecture is a useful foundation. Messaging has a meaningful transaction/idempotency boundary, preferences update atomically, and internal locale routing and current catalogs are coherent. Retain these structures. The most valuable changes concern trust boundaries and workflow failure semantics, rather than a broad rewrite.

The release blocker is public email-OTP registration in an Invite-only product. Other confirmed high-priority problems include reset tokens redirected to unrelated Vercel tenants, email-only bypass of enabled 2FA, stale authentication after session revocation, PostgreSQL certificate verification being disabled, and unsafe push destination/audience handling. App-level Admin and impersonation restrictions are not consistently enforced by native auth endpoints and callable feature commands.

Start with AUTH-001, AUTH-002 and OPS-001; then close alternate authentication and authorization paths using [the access-control recommendation](access-control.md). Fix notification trust/activity rules next. Address recovery/pending UI and documentation in their owning workflows. Full implementation sequencing and proportional verification are in [the handoff](handoff.md).

## Contents

| Document | Canonical content |
| --- | --- |
| [Handoff](handoff.md) | Tomorrow's starting point, implementation rules, decisions and verification gaps |
| [System map and ledger](system-map.md) | Baseline, versions, route/workflow/schema/docs maps, check evidence, acceptable areas |
| [Authentication](authentication.md) | AUTH-001–005 |
| [Architecture and operations](architecture-operations.md) | AUTHZ-001–002, ARCH-001, OPS-001–003, TOOL-001, DOC-001 |
| [Access-control recommendation](access-control.md) | Actor/policy APIs, native endpoints, outcomes, library comparison and migration |
| [Notifications](notifications.md) | NOTIFY-01–04 |
| [UI/runtime/i18n](ui-runtime.md) | WEB-001–005, I18N-001 |

## Scope and exclusions

Reviewed architecture, installed Next/React behavior, authentication/account workflows, access control, schema/application boundaries, forms/actions/reads, notifications/email, basic static accessibility/responsiveness, internationalization completeness, production configuration/diagnostics, dependencies and documentation. The current branch already implements Posts, messaging, user-management and push; it is ahead of the prompt's product summary.

Excluded as requested: **Erasure**, database migrations, blanket test-coverage auditing, rate-limit design, durable business audit infrastructure, translation wording, detailed unimplemented-product design, multi-tenancy and implementation. Basic source inspection is not browser accessibility certification. Only this new review directory was written; existing source/config/docs, issues, branches and generated files were not intentionally modified.

## Compact system map

Locale-neutral browser routes → proxy session/locale/route decision → internal `[locale]` layouts and thin routes → feature-owned screens, reads and actions → core auth/DB/preferences/email/push. Shared UI stays presentation-only. Better Auth's native API handler is an independent public surface outside the proxy matcher. PostgreSQL schemas are split by auth, messaging, Posts, notifications and preferences. See the [diagram, route map and workflow traces](system-map.md#system-map).

## Prioritized finding index

Read each linked canonical finding before implementation; this table is an index, not a duplicate specification.

| ID | Priority | Finding |
| --- | --- | --- |
| [AUTH-001](authentication.md#auth-001) | Blocker | Email OTP permits membership without an Invite |
| [AUTH-002](authentication.md#auth-002) | High | Shared Vercel wildcard trust leaks reset tokens to unrelated tenants |
| [AUTH-003](authentication.md#auth-003) | High | Email-only sign-in bypasses enabled 2FA |
| [AUTH-004](authentication.md#auth-004) | High | Cached session identity survives revocation and role changes |
| [AUTHZ-001](architecture-operations.md#authz-001) | High | Native Admin setters bypass target rules; final Admin check is non-atomic |
| [AUTHZ-002](architecture-operations.md#authz-002) | High | Impersonation restrictions stop at route/identity boundaries |
| [OPS-001](architecture-operations.md#ops-001) | High | Database SSL mode is forced to no certificate verification |
| [OPS-002](architecture-operations.md#ops-002) | High | Environment contract misclassifies production and rejects documented setup |
| [NOTIFY-01](notifications.md#notify-01) | High | Stored push endpoints control server-side network destinations |
| [NOTIFY-02](notifications.md#notify-02) | High | Inactive Users remain eligible push recipients |
| [AUTH-005](authentication.md#auth-005) | Medium | Completed password reset becomes failure when 2FA follows |
| [ARCH-001](architecture-operations.md#arch-001) | Medium | Sensitive reads/server-only leaves depend on implicit caller contracts |
| [OPS-003](architecture-operations.md#ops-003) | Medium | Unexpected failures lose diagnostics or become forbidden outcomes |
| [TOOL-001](architecture-operations.md#tool-001) | Medium | Runtime dependencies are indirect and auth schema tooling is version-skewed |
| [DOC-001](architecture-operations.md#doc-001) | Medium | Root status, routes and generation guidance are stale |
| [NOTIFY-03](notifications.md#notify-03) | Medium | Browser subscription existence is mistaken for current User binding |
| [NOTIFY-04](notifications.md#notify-04) | Medium | Push has no deadline and conflates acceptance with bookkeeping |
| [WEB-001](ui-runtime.md#web-001) | Medium | Control characters evade the internal return-path check |
| [WEB-002](ui-runtime.md#web-002) | Medium | Password forms do not subscribe to submission state |
| [WEB-003](ui-runtime.md#web-003) | Medium | Rejected account operations leave unusable or uncertain UI |
| [WEB-004](ui-runtime.md#web-004) | Medium | Denied/missing/failed route states lack useful application recovery |
| [I18N-001](ui-runtime.md#i18n-001) | Medium | Validation/fallback/used primitive copy bypasses locale contract |
| [WEB-005](ui-runtime.md#web-005) | Low | Failed member search is shown as no matching members |

## Coverage matrix

**Deep** means the relevant high-risk flow and its boundaries were traced. **Sampled** means representative/pattern-based source inspection. Neither implies deployed runtime verification. Detailed files and no-finding conclusions are in the [ledger](system-map.md#inspected-and-acceptable-ledger).

| Area | Coverage | Inspected flows/files; disposition | Remaining verification |
| --- | --- | --- | --- |
| Baseline/instructions/domain/ADRs | Deep | All local instruction docs, ADR 0001–0005, existing prompt/index, installed versions | Remote merge/deployed state not asserted |
| Architecture/modules/dependencies | Deep + sampled | Feature entries, import graph, shared/core rules, read/command seams; ARCH-001, TOOL-001 | Full archunit suite timed out |
| Password/username login, activation/reset | Deep | Account services/forms/actions + native auth source; AUTH-001–005, WEB-001–003 | Real browser/SMTP |
| 2FA/OTP/backup codes/passkeys/sessions | Deep | Native plugin matchers, account hooks, isolated handler probes | Actual WebAuthn ceremony/device behavior |
| Authorization/impersonation | Deep | Global grants, route policy, native setters, feature commands; AUTHZ-001–002 | Full endpoint inventory during fix; concurrent DB scenario |
| User-management/Invite/bulk | Deep | Validation, CSV cap/preview, creation/email outcomes, role/activity commands | Browser failure/race acceptance |
| Data/schema/Drizzle/preferences | Deep source | All five schema files, constraints/indexes, transaction/query shapes, JSONB contract | Live schema/catalog and concurrency; migrations excluded |
| Messaging/Posts | Deep source | Send/read/idempotency/sequence, publication/reads/rendering | DB/browser acceptance; retain core design |
| Push/email side effects | Deep push; sampled email adapter | Subscription ownership, recipient filters, provider outcomes; NOTIFY-01–04 | Real supported-browser/provider integration |
| Next/rendering/cache/routes | Representative deep | Installed docs, proxy, layouts/Suspense/root params, actions/handler; WEB-004 | Production build incomplete; no measured navigation/performance claim |
| Forms/errors/loading/success | Deep sensitive forms + sampled others | Reset/2FA/passkeys, user import/actions, message search/composer | Browser outage/reconciliation tests |
| Basic a11y/responsive/design overrides | Sampled static | Labels, error roles, dialogs/table/navigation/layout primitives | Keyboard/screen reader/mobile visuals not performed |
| I18n structure/completeness | Deep + automated | Cookie/root param contract, keys/ICU, fallback paths; I18N-001 | All-locale runtime failure presentation |
| Production/config/secrets/logging/headers | Deep config; sampled deployment surface | Env, TLS, email mode, native origins, catch paths; OPS-001–003 | Deployed headers/cookies/health signals not inspected |
| Documentation/dead code/stale experiments | Sampled + dependency graph | Root/module docs, scripts, config, unused package references; DOC-001/TOOL-001 | No exhaustive vulnerability/dead-code scan claimed |
| Explicit exclusions | Excluded | Erasure, migrations, rate-limit/audit design, translation wording, future-feature detail | Separate tasks only |

Every agreed review category has a deep pass, a representative pass or a stated exclusion. **Source coverage is complete at that level; runtime verification is partial.** No important pending source-reading frontier is hidden behind a completion claim.

## Access control and documentation recommendations

Use **a small application-owned policy module** with authoritative actors, User/Admin coarse roles and descriptive target policies. Retain both real and effective identity during impersonation. Apply enforcement at private reads, commands, actions, route handlers and native plugin endpoints; UI checks are affordances. Keep unauthorized, forbidden, invalid-target/resource-unavailable and infrastructure-unavailable outcomes distinct. [The concrete design](access-control.md) compares plain policies, Better Auth grants and CASL and supplies APIs, boundaries and migration steps.

Keep README and AGENTS as short navigation documents, CONTEXT as vocabulary, ADRs as team decisions and module READMEs as local contracts. Refresh the root route/status/setup map and clarify generated auth-schema ownership. A contents list is useful; document splitting should follow ownership, not size alone. Canonical actionable guidance is [DOC-001](architecture-operations.md#doc-001).

## Assumptions, decisions and unresolved product questions

Review decisions: the supplied detailed contract superseded the review skill's preliminary question round; new review artifacts are the intended exception to read-only; current branch code and installed versions outrank stale status text; intentional ban-field/flat-organization ADRs remain valid; no code or tracker implementation followed review.

Assumptions: this is one association, internal content is for active Users, and the existing messaging impersonation restriction expresses a real privacy intent. Normal User/Admin authority must be enforced independently of visible screens. No production credentials/configuration or release topology was assumed.

Product decisions to ratify are **impersonation credential powers**, **email-only recovery semantics**, **push binding after explicit logout/account switches**, and **production/preview/local environment policy**. Recommended defaults and implementation consequences are recorded in [the handoff](handoff.md#product-decisions-awaiting-ratification); no broad unanswered question prevented this review.

## To explore after concrete defects

These are optional questions, not additional implementation findings:

- Measure proxy session/preference cost and duplicate request identity lookups before considering lighter navigation checks. Preserve authoritative feature enforcement; request-local memoization is the first option.
- Revisit CASL only if actual resource/field rules outgrow clear descriptive policies. No external policy server or generalized organization model is justified now.
- Measure client catalog/font cost before splitting catalog delivery or changing the root shell. Current full-catalog provision is deliberate and correct; no performance regression was demonstrated.
- Revisit first-message composer recovery after a committed send with lost acknowledgement and edited retry. The fixed key can encounter the intentional idempotency rejection; prove the UI recovery case before expanding the send protocol.
- Define a small deployment readiness/health contract when hosting is settled. Keep it separate from durable audit infrastructure; no generic monitoring platform is proposed.

## Verification, unfinished areas and continuation

**Passed:** typecheck, lint, 140 non-architecture tests, bounded static dependency check and catalog/ICU validation. Multiple security behaviors were confirmed with in-memory auth/fake-transport probes. **Incomplete:** full architecture suite and production build; no live DB, real delivery, authenticated browser, WebAuthn/device, mobile/a11y or deployed-configuration acceptance. Exact results and limits are in [the verification ledger](system-map.md#verification-performed).

To continue, read [handoff.md](handoff.md), compare affected files and installed versions with this snapshot, and recheck only changed or explicitly unverified conclusions. Keep finding IDs stable; record implementation resolutions separately instead of rewriting this historical evidence. Do not rerun the entire review. The current task ends with these artifacts and no implementation.

**Preservation check:** all 366 original tracked/existing-untracked files matched their baseline hashes at completion. Eight Markdown review files were added inside this directory; no tracked source/configuration/documentation change was present in `git diff`.
