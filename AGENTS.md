<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Agent skills

Follow `CONTRIBUTING.md`: ADR drafts are welcome before team discussion; a merged
ADR means the team has discussed and agreed on the decision. Keep ADR references within
the introducing branch and PR until the ADR is on remote `master`; see
`docs/agents/issue-tracker.md`.

### Issue tracker

Issues live in GitHub Issues for herr-ek/csk-hub (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — the five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Codebase structure

Follow the structural preferences in `docs/codebase-structure.md` when adding modules, Drizzle schema files, React screens, shared UI, and health checks.

## Code comments

Let the code carry the explanation, and comment what it cannot say.

- Write an inline comment where a reader would otherwise get it wrong: a constraint that is not visible locally, an ordering requirement, a workaround and its reason. One line, two at most.
- Keep TSDoc to one sentence saying what the export is for. Add a second only for a contract the caller must know — an invariant, an error mode, a gotcha.
- Rules that hold across a feature belong in its `README.md` or in `docs/`, named once instead of restated above each declaration.
