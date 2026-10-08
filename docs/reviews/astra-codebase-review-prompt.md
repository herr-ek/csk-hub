# Astra codebase review prompt

Copy and paste the prompt below into GPT-6-Astra from the repository root. It requests a canonical Markdown review first, then a highly interactive, repository-local codebase atlas with source navigation, workflow traces and behavior labs only after the user gives an explicit written go-ahead.

```text
You are performing a production-grade architecture and codebase review of CSK Hub. Your job is to produce a durable, resumable Markdown review that another coding agent can use to implement approved improvements. Every finding must remain clear and useful in its canonical Markdown document without the website. After explicit written user approval, a separate phase can create a highly interactive website that helps readers navigate all findings and use behavior labs to understand complex issues.

Application and repository inspection is read-only. During the review phase, you may create or update the requested Markdown review artifacts under `docs/reviews/<review-name>/`. Only after explicit written approval for the website phase may you also create or update website source, its generated bundle and rebuild instructions there. These review deliverables are the only repository-write exception. Do not modify application code, application configuration, migrations, other documentation, issues, branches, dependencies or application-generated files. Do not implement the recommended fixes. Preserve unrelated user work.

## Two-stage delivery and written go-ahead

Complete the Markdown review and make its findings, evidence, coverage and handoff concrete and reviewable before asking about the website. Deliver those artifact paths, summarize the review status, and ask for explicit written approval to continue with website generation. Then stop the review turn. Using this prompt alone does not authorize the website phase, and silence or elapsed time does not count as approval.

The user can resume later with a written instruction such as “Go ahead and generate the interactive website from this review.” Once that approval is given, complete the website without asking for the same approval again. Do not require the review and website to be completed in one session. Preserve the reviewed commit IDs and canonical artifacts so the website phase can resume without repeating the review.

## Product and repository context

CSK Hub is the internal web application for Chalmers Sångkör. It will serve one student association and its three permanent choirs. The current repository contains a substantial authentication/account foundation; choir, rehearsal, event, gig, and news capabilities are still largely ahead.

Read repository-local instructions before judging the code, especially `AGENTS.md`, `CONTRIBUTING.md`, `CONTEXT.md`, `docs/codebase-structure.md`, `docs/agents/`, existing ADRs, and any existing review artifact. Treat the installed package versions as authoritative. The current stack includes Next.js 16.3, React 19.3, Better Auth 1.7, Drizzle/PostgreSQL, next-intl, Tailwind 4, shadcn-style/Base UI primitives, TanStack Form, Bun, Vitest, TypeScript, and Biome.

Use current official documentation and installed package source for version-sensitive claims. Research only the smallest relevant sections needed to answer concrete review questions; do not summarize entire frameworks.

The established domain vocabulary is intentional but may be challenged when evidence suggests it is misleading or structurally harmful. In particular, distinguish User, Admin, Invite, Inactive User, Erasure, Choir, Post, and News feed as defined in `CONTEXT.md`.

## Review objective

Find the changes that would make this codebase production-grade, maintainable, clear, secure, straightforward, and pleasant for future agents to extend. Optimize for low total cognitive load and high change locality, not for the fewest files, abstractions, dependencies, or lines of code. Advanced UX and framework capabilities are welcome when they solve a real product problem and have clear failure/reconciliation semantics.

Challenge existing conventions, names, dependencies, architecture, and planned work when warranted. Do not turn taste into a defect. Prefer concrete evidence, confidence labels, and explicit tradeoffs.

## Hard scope and exclusions

In scope:

- Architecture, module boundaries, dependency direction, naming, locality, and agent discoverability.
- Next.js/React idioms for the installed versions, including server/client boundaries, routes, actions, caching, rendering, browser APIs, and framework-owned files.
- Better Auth integration and account workflows: passwords, passkeys, 2FA, OTP, backup codes, activation, reset, sessions, cookies, username login, and impersonation.
- A reusable access-control design. Compare a small application-owned policy module with suitable libraries. Recommend target APIs, boundaries, migration shape, and enforcement rules. Better Auth should establish identity; application policy should answer whether an actor may perform an action on a resource.
- Database/schema/application boundaries, Drizzle usage, constraints, nullability, relationships, indexes, transactions, query shape, and schema hacks or encoded business behavior. Database migrations are excluded.
- Forms, server actions, route handlers, data loading, error handling, loading/empty/success states, notifications, email/push side effects, and admin/bulk workflows.
- Basic accessibility, responsive behavior, and hard-coded component overrides that bypass the design system. Do not perform a broad design-system or translation-quality review.
- Internationalization architecture, locale routing, translation-key structure, placeholder/plural correctness, and completeness mechanisms. Assume the current English, Swedish, and German translation wording is good; do not critique translations.
- Production correctness and resilience: environment validation, secrets, secure cookies/headers, origin/redirect boundaries, error exposure, database/external-service failures, health signals, operational logs, and client-bundle/server-only boundaries.
- Documentation and agent documentation: structure, ownership, precedence, contradictions, discoverability, stale guidance, and whether large documents should be split behind a TOC.
- Dead code, dependency cycles, unused dependencies, stale experiments, misleading placeholders, and configuration that affects correctness or maintainability.

Out of scope or deliberately limited:

- Do not investigate or redesign GDPR Erasure; it is known to be incomplete and will be handled separately.
- Do not audit test coverage or demand unit tests everywhere. Use tests as evidence and recommend coverage only for critical behavior or meaningful guardrails.
- Do not review database migrations.
- Do not design rate limiting unless an unrelated correctness/security defect makes it relevant.
- Do not design durable business audit trails or persistent audit infrastructure. Basic operational diagnostics may be discussed.
- Do not judge the wording or quality of existing translations.
- Do not design unimplemented product features in detail. Review only foundations and readiness gaps for them.
- Do not invent multi-tenancy, enterprise-scale infrastructure, generalized organization models, or speculative product capabilities.
- Do not begin implementation after writing the review.

## Review method

Work in phases and maintain a compact working ledger so the review can be resumed with minimal token use:

1. Establish the baseline: repository state, instructions, package versions, scripts, existing review artifacts, ADRs, TODOs, and known in-progress/generated files. Resolve and record immutable commit IDs. If the user specifies “changes since” a commit, branch or tag, record both the resolved base and reviewed head, and scope the review accordingly. Preserve user work and do not treat incomplete work as a defect without context.
2. Build a compact system map: route topology, feature/core/shared boundaries, dependency direction, auth/session flow, representative vertical workflows, schema ownership, external adapters, documentation hierarchy, and validation commands.
3. Build a coverage matrix. For each area record status, files/flows inspected, findings, and remaining work. Full coverage means every agreed category has either a deep pass, a representative/pattern-based pass, or an explicit justified exclusion.
4. Inspect relevant framework/library guidance only when a concrete behavior needs verification.
5. Trace representative workflows end to end, especially login, activation, reset, 2FA, passkeys, account settings, user management, impersonation, and privileged mutations.
6. Run inexpensive, read-only or disposable-environment checks where practical: typecheck, lint, tests, build, static searches, architecture checks, local app/browser flows, and schema inspection. Do not spend excessive tokens reproducing a likely bug; a strong code-based analysis may be labeled “Strongly probable.”
7. Run cross-cutting passes for architecture, access control, data boundaries, error handling, UI/runtime behavior, production resilience, dependencies, and documentation.
8. Consolidate duplicate findings, reconcile recommendations, and prioritize by impact plus leverage. Prefer the smallest design that solves the demonstrated problem; retain larger redesigns as concise “To explore” proposals.
9. Write or update the canonical review artifacts, coverage matrix, assumptions, open questions, and implementation handoff. Deliver the completed Markdown review, ask for the written website go-ahead described above, and stop. Do not create website files during this phase.
10. Only in the approved website phase, build the interactive codebase atlas described below, using the completed review and pinned source as its data. When upgrading an existing review website, preserve its canonical finding bodies, IDs, confidence, historical verification ledger and saved-note compatibility.
11. In that website phase, verify the website, its evidence links and its interactive models, produce the self-contained deliverable, and report how to open and rebuild it. Complete the authorized website work before stopping.

Use pattern sampling for repeated low-risk files and representative shared primitives. Inspect security-sensitive and high-risk workflows more deeply. Avoid rereading source already captured in the ledger unless code changed or exact evidence is needed.

## Finding standard

Write each actionable finding as a self-contained, human-readable Markdown ticket. The website is a navigation and explanation aid; it must not be required to understand the finding. Each ticket must include:

- Stable ID and concise title.
- Type: bug, security risk, architecture risk, data-model issue, convention issue, documentation issue, readiness gap, or exploration.
- Priority/severity: Blocker, High, Medium, Low, or Note.
- Confidence: Confirmed, Strongly probable, or Speculative.
- Exact affected paths and line numbers where practical.
- A plain-language summary and description of the observed problem, understandable without prior knowledge of the codebase.
- Observed behavior/fact, separate from inference and recommendation.
- Why it matters to this product.
- Recommended change and the owning boundary.
- Short alternative or tradeoff when relevant.
- Dependencies and rough effort: S/M/L/XL.
- Concrete acceptance criteria and verification steps.
- An “ELI5” explanation that explains the mechanism and consequence in everyday language.
- A compact pseudocode or interface sketch for nontrivial logic, state transitions, or proposed rules, when it makes the issue or recommendation easier to understand. Keep it illustrative and label proposed behavior; do not make readers infer that pseudocode is implemented code.

Group occurrences that share one root cause, but list representative locations and enough scope to implement the fix. Suppress cosmetic cleanup unless it reveals a repeated structural problem. Explicitly record inspected areas with no actionable finding. Do not claim formal certification.

For probable bugs, state the code reasoning and confidence. Reproduction is optional when it would consume disproportionate time or tokens.

## Access-control focus

Give access control a concrete recommendation. Evaluate whether CSK Hub should use:

- explicit coarse roles such as User and Admin;
- descriptive domain policies such as `canManageUsers(actor)`, `canInviteUser(actor)`, `canChangeUserRole(actor, target)`, and `canActAsUser(actor, target)`;
- server-side enforcement at every action, route handler, privileged read, and mutation;
- UI checks only as user-experience affordances;
- deliberate distinctions between unauthenticated, forbidden, invalid-target, and unavailable-resource outcomes;
- a small application-owned module versus an authorization library, with real maintenance and integration tradeoffs.

Pay special attention to impersonation and privilege escalation. Do not design persistent audit trails in this review.

## Report artifacts

If the review is large, create a directory such as `docs/reviews/<review-name>/` with a canonical `README.md` TOC and focused documents. If it is small, one Markdown document is enough. Never duplicate the canonical body of a finding across files.

At minimum, the canonical entry point must contain:

- executive summary and “start here” sequence;
- scope and exclusions;
- product/system map;
- coverage matrix and inspected/acceptable ledger;
- prioritized actionable findings;
- access-control recommendation;
- documentation recommendations;
- concise “To explore” redesigns for large or speculative work;
- assumptions, unresolved product questions, and decision log;
- implementation handoff and verification guidance;
- continuation instructions for a second session.

Every finding must have a stable ID and one canonical Markdown location. Findings may be grouped by area in one or more Markdown files, but each ticket must be complete and independently readable; do not put essential explanation only in the website, a lab, or a cross-reference. Preserve the review as a dated snapshot. If the repository changes in a later session, inspect the relevant diff and mark stale conclusions for re-checking.

Use concise source references rather than copying code. Include short before/after interface sketches or pseudocode only when they make a recommendation unambiguous. Use official documentation links for framework claims.

## Interactive codebase atlas

The following requirements apply only after the user has explicitly authorized website generation in writing. Create a complete, highly interactive repository-local website alongside the completed Markdown review. Treat it as a working environment for understanding the code: a reader should be able to move from a module to an actual import reference, follow a workflow, inspect its source, open a finding and experiment with the behavior that makes the finding matter.

On resuming, read the canonical review, handoff and recorded snapshot before building. If the repository has moved on, use the original reviewed source for this historical website and explain its date. Do not rerun the review or silently refresh its conclusions unless the user requests that separately.

Use `docs/reviews/2026-09-23-production-review/atlas.html` and its `viewer/` sources as the interaction and visual reference. The October change-review atlas is also useful for base/head/diff navigation. Inspect these implementations and reuse the established shell, navigation and source-rendering patterns where suitable. Adapt content, models and counts to the review being performed; derive counts from data. Do not blindly carry over historical findings or source assumptions from a reference website.

Deliver `atlas.html` at the review directory root as the obvious, self-contained entry point. Embed the source data, CSS and JavaScript so it can be opened directly from disk and used offline. Keep a maintainable multi-file implementation under `viewer/`, with a documented rebuild command. Use existing tools and dependencies. Avoid external CDN assets, analytics, remote source fetches, a new application backend or a deployment requirement.

### Snapshot and evidence contract

- Read source from the immutable reviewed commit using Git without switching branches. Display its date, branch and commit prominently. For a change review, preserve base and head source, identify changed/deleted paths and provide source/base/diff views with appropriate line references. For a single snapshot, provide source navigation without inventing a diff.
- If explicitly reviewing uncommitted work, record it as a separate captured working-tree overlay and label it clearly. Do not silently show a committed snapshot as evidence for uncommitted findings, or show newer source under an older review date.
- Include the relevant source, schemas, tests, configuration and domain/agent documents within the agreed review scope. Never embed actual environment files, credentials, database contents, private runtime data or excluded migrations. A tracked environment example may be included after inspection.
- Generate import relationships and declaration symbols from parsed source where practical. Label type-only imports, external/unresolved references and discovery limits. A dependency map represents imports; workflow ordering is curated unless an actual runtime trace was captured.
- Validate every annotation, source range, workflow symbol and reference against the embedded snapshot. Explicitly identify evidence outside the index, such as installed vendor source. Never fabricate a clickable source location.
- Keep finding bodies in their canonical Markdown locations and generate website data from them. Associate findings with actual source ranges and contextual owning modules; distinguish annotated-file counts from contextual finding counts.
- Escape source and Markdown content when rendering and when embedding it into HTML, including script-closing sequences. Source text must remain inert. Rebuilds should fail clearly for broken required references or parse errors rather than silently dropping evidence.

### Required exploration surfaces

1. **Map:** an interactive module dependency map. Selecting a module highlights its import neighborhood and opens its responsibilities, entrypoint, files and findings. Expand inbound/outbound relationships to reveal actual source import references and jump to their lines. Offer useful scope lenses, such as the whole snapshot and reviewed/changed boundaries. Module nodes must support keyboard activation and readable labels.
2. **Files:** a repository tree with path filtering, relevant scope filters, optional tests and declaration navigation. Show readable source with line numbers, selected ranges and finding annotations. Let the reader follow imports, reverse importers and related tests. Explain that related-test navigation does not establish coverage. Render contextual Markdown documents and make indexed source references navigable.
3. **Traces:** step through representative end-to-end workflows. Each step names the boundary, explains what happens and shows the relevant verified source snippet. Include previous/next controls, direct step selection, full-source navigation, related findings and links into labs. Cover the important reviewed workflows, including alternate entrypoints and failure/recovery paths; choose depth from actual evidence rather than a fixed number of traces.
4. **Lab:** provide the interactive behavior models specified below, with an experiment picker and direct links back to source, findings and workflows.
5. **Review:** preserve access to every canonical finding and report document. Provide both a filterable finding index and a dedicated finding reader that presents all findings one at a time in a clear, human-readable ticket format, with previous/next navigation through the current result set and direct selection from the index. The reader must show the full canonical description, ELI5 explanation, any pseudocode/interface sketch, evidence, recommendation, tradeoffs, acceptance criteria, confidence, effort, source anchors, and linked workflows/labs. Support filtering by ID/text, severity, area and saved shortlist, personal notes and a portable Markdown shortlist export. Preserve existing storage keys and compatible note formats when upgrading a viewer. Keep notes browser-local and label proposals and unresolved product decisions accurately.
6. **Evidence:** show what the original review checked, what passed, what was confirmed only in isolation, what remained incomplete and what was excluded. Include coverage, acceptable structures worth retaining, source/index limits, assumptions and the handoff. Keep website verification separate from historical application verification.

Provide global search through paths, symbols, source lines and findings with `Cmd+K`, `Ctrl+K` and `/`. Encode selected view, module, file/range, trace step and lab in the URL; support reloads and browser back/forward. Preserve useful older deep links when upgrading a viewer. Clearly describe which inputs and notes persist.

### Behavior labs: explain complex mechanisms by letting the reader experiment

Every actionable finding must be fully understandable from its canonical Markdown ticket and navigable in the website, whether or not it has a lab. Create an interactive lab for a finding when changing inputs, state, event order, or rules helps a reader understand a complex mechanism or compare current behavior with a proposed rule. A lab may cover several findings with a shared root cause. Do not force a lab for a straightforward issue; link it directly to its ticket, source evidence and relevant workflow instead. Use the controls and model appropriate to the evidence: a state machine, timeline, competing-operation stepper, authority matrix, input normalizer, failure injection model, deployment contract comparison or documentation/source comparison.

Each lab must include:

- A concrete question, named inputs and sensible defaults that expose the demonstrated problem.
- Controls that change meaningful behavior: selectors, switches, sliders, independent failure outcomes or event/interleaving steps. The reader must be able to explore a passing case as well as the problematic case.
- A visible intermediate state or sequence, such as actor → guard → command → side effect, cache age → authority freshness, or two transactions reading and writing in different orders.
- An outcome explaining why those inputs produce that result. Update it immediately when inputs change; support reset and back/advance where appropriate.
- A clearly labeled “current behavior / explore proposed rule” comparison with the same relevant inputs. Changing the proposed-rule switch must change the modeled rules and outcomes, not just recolor a card. If a rule remains a product decision, label it as an unapproved proposal.
- Direct links to the exact source ranges behind the current behavior, the canonical finding and a related workflow.
- A short statement of assumptions and limits: what is literal source behavior, what was reproduced, what is inferred, and what the simplified model does not establish. Proposed code or translations must remain visibly illustrative.

Choose experiments from the findings actually present, prioritizing issues whose behavior depends on a sequence, combination of conditions, or competing rules. Record which findings have labs and briefly explain why the model helps; also record when a finding is adequately explained by its ticket, source links or workflow. Useful examples include stale cached identity after revocation or demotion; alternate auth entrypoints and Invite/2FA rules; origin/redirect normalization; concurrent last-Admin mutations; impersonation identity across route and command boundaries; browser subscription ownership after account switching; recipient selection; provider success followed by metadata failure; pending state across unrelated renders; a lost response after a committed mutation; and contradictory deployment/environment settings.

For structural or documentation findings, let the reader compare real imports, contracts or claims with the relevant source and a proposed boundary. Do not force a hypothetical runtime failure onto a finding that establishes only a structural risk. Avoid identical generic toggles for unrelated findings: each model should teach the specific mechanism.

All labs must be local, deterministic explanatory models. They must not invoke application services, alter accounts, connect to databases, send email/push, probe endpoints or navigate to hostile URLs. Render URL fixtures as escaped text. An illustrative outcome is not evidence that a fix has been implemented or verified. Keep finding severity and confidence unchanged when a reader experiments or saves a note.

### Interaction quality and verification

Use a cohesive, polished workspace with clear navigation, legible code, restrained motion, contextual inspectors and useful empty/error states. Make interactions discoverable and keyboard accessible. Provide labels, focus management, escape-to-close dialogs, reduced-motion support and responsive layouts. Contain horizontal scrolling within code/maps rather than overflowing the page. On narrow screens retain access to files, search, traces, findings and the experiment picker.

Before delivering:

- Rebuild from the pinned data and verify expected finding counts, complete canonical ticket rendering, documented finding-to-lab associations and rationale, annotations, workflow anchors and import references. Check generated JavaScript syntax and the standalone bundle for missing external assets.
- Exercise every model renderer and its important input branches, including current/proposed rules, passing/failing cases, failure combinations, reset and competing-operation steps. Check the modeled results against the source reasoning. Use proportional automated checks for these contracts.
- Run the standalone `atlas.html` in a real browser. Verify map-to-source navigation, imports/symbols, trace stepping, global search, finding/document links, lab controls, shortlist/notes, deep links and browser history. Preserve existing user notes while checking persistence.
- Inspect desktop and narrow layouts, check for unintended page overflow, verify keyboard navigation and inspect console errors. Save a representative screenshot of the finished site. If browser verification is unavailable, say precisely what remains unverified.
- When upgrading an existing site, verify canonical report preservation and saved-note compatibility. Record website checks separately from application checks and do not imply that passing model checks reproduces a production bug or validates a production fix.
- Document the entry point, rebuild command, optional loopback preview command, pinned snapshot, source exclusions, graph/model limitations and persistence behavior in `viewer/README.md`.

## Final handoff

End with a concise handoff for a future implementation agent. It must say how to choose work, preserve product vocabulary and scope, read the relevant finding first, make changes incrementally, update the appropriate documentation/ADR when needed, and run proportional verification. It must not ask the implementation agent to redo the review.

Do not ask broad clarification questions. Make reasonable assumptions from the repository and record them. Ask only when an unanswered product decision would materially change a high-impact recommendation.

At the end of the review phase, report the canonical artifact paths, coverage status, highest-priority findings, unresolved decisions and explicitly unfinished areas. Ask for explicit written go-ahead to generate the interactive website, and stop without generating it. Record the reviewed commit IDs and website continuation instructions in the handoff.

At the end of the approved website phase, report the canonical report and `atlas.html` paths, how to open and rebuild the website, website verification and any unfinished checks. Include the finished-site screenshot when available. Only the authorized review deliverables may be written; application code and other repository state remain unchanged.
```

## Intended artifact shape

When the review warrants multiple files, use a shape like the following. The `atlas.html` and `viewer/` entries are created only in the separately approved website phase:

```text
docs/reviews/<review-name>/
  README.md          # TOC, executive summary, coverage, start-here plan
  system-map.md     # architecture and workflow map
  findings.md       # canonical actionable findings, or focused finding files
  security-auth.md  # auth and access-control findings
  data.md           # schema/application and Drizzle findings
  ui-runtime.md     # UI, Next/React, browser, and runtime findings
  documentation.md  # repository and agent-documentation findings
  explore.md        # concise larger redesign ideas
  handoff.md        # implementation-agent instructions
  atlas.html        # generated, self-contained offline website; open this
  viewer/
    README.md       # open/rebuild/preview instructions and evidence limits
    index.html      # maintainable multi-file entry point
    styles.css      # responsive workspace and source/model presentation
    app.js          # navigation, tree, map, source, traces, review and search
    labs.js         # deterministic interactive behavior models
    data.js         # generated canonical-review and pinned-source data
    atlas.config.mjs # snapshot, module layout, annotations, traces and labs
    build-data.mjs # reproducible Git/source/report extraction and bundling
```

Do not create all Markdown files mechanically. Use the smallest artifact set that preserves locality, navigation, and resumability. The viewer filenames above are an established implementation shape; adapt the tooling if needed while preserving the self-contained `atlas.html` entry point, maintainable sources and reproducible build.
