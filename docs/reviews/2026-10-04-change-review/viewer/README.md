# Codebase atlas

Repository-local, offline explorer for the review of
`b5fd804b7c840bf76a45afe4667d2507d01b9b0d...031da8f8d6a9162834b1697ffb3f53bf0e4acd56`.
Its visual starting point is `astra_review_template`; navigation centers on real source rather than a findings backlog.

Open `../atlas.html` directly in a browser. It is a self-contained generated file with inline styles, scripts and source data. The maintainable multi-file version is `index.html`; it also works without a server. Clipboard permissions depend on the browser.

For an HTTP preview, from the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/reviews/2026-10-04-change-review/viewer
```

Then open <http://127.0.0.1:8765>.

- **Map:** select modules, expand import relationships to see actual references, then jump to those lines.
- **Files:** browse the tree, include tests, filter changed files, follow imports and declaration symbols, and compare source with base and diff. Removed files open their base version.
- **Traces:** step through five workflows. Every step is anchored to a declaration verified against the pinned snapshot.
- **Lab:** eight illustrative experiments expose dates, stale state, cache time, query windows and transaction interleavings. Switch between current behavior and proposed rules.
- **Evidence:** inspect confidence, verification limits and the nine commits. Findings open the canonical report bodies with source links.

Use `⌘K` / `Ctrl+K` or `/` to search files, symbols, source and findings. URLs retain the selected module, source range, trace step or experiment, so browser back/forward works and locations can be shared. Experiment inputs remain in memory until reload; nothing is written to the application or database.

## Rebuild

From the repository root, with its existing dependencies installed:

```sh
node docs/reviews/2026-10-04-change-review/viewer/build-data.mjs
```

This reads Git and regenerates `data.js` plus `../atlas.html`. It does not check out another branch or alter application files. Babel's installed parser supplies AST imports and declarations. `atlas.config.mjs` owns the pinned commits, module positions, source annotations and curated traces. The report in `../README.md` owns finding text.

The builder rejects missing trace symbols, out-of-bounds source annotations and an unexpected finding count. Parse failures make the command fail. Generated source text is escaped before embedding and rendering.

The atlas contains 416 files including three deleted paths; 190 changed paths are indexed. Ten changed paths are excluded: nine migration/schema snapshot paths and `bun.lock`. Excluding those paths follows the review scope. Source imports include type-only references and exclude test files from the module graph. Runtime discovery, computed imports and undeclared dependencies are not inferred.

## Verification

Application verification is recorded in the canonical report and predates this explorer. Explorer verification covers its own snapshot links, syntax, browser interactions and responsive layout; a lab outcome is a model, not an application test result.

Reproduction scripts under `../evidence` are preserved as text to avoid ordinary test discovery executing review-only scripts. Their temporary database names and machine-local typechecking configuration document the original experiment rather than a portable test runner.
