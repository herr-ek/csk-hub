# September production review atlas

Open [../atlas.html](../atlas.html). It is the self-contained website, with source,
styles and scripts embedded for offline use. `index.html` is the maintainable
multi-file version of the same explorer.

The source is pinned to `930a2a527b5f124e9a764b224f32994651a417b6`, the original
September 23 review snapshot. The eight canonical review documents remain intact.
Subsequent fixes are not reflected in this historical explorer.

- **Map:** explore 18 modules and 62 actual import relationships; expand a
  connection to jump to its source references.
- **Files:** browse 321 source and context files, declaration symbols, imports,
  related tests and review annotations. Include tests or show annotated files only.
- **Traces:** step through nine workflows, each linked to verified source ranges.
- **Lab:** change inputs, advance illustrative sequences and compare current
  behavior with proposed rules in 22 models covering all 23 findings.
- **Review:** filter findings, open original report sections, pin a shortlist,
  keep local notes and export a Markdown handoff. The original browser storage
  key and saved-note format are preserved.
- **Evidence:** inspect historical checks, coverage and limits of the review.

Use `Cmd+K`, `Ctrl+K` or `/` to search paths, symbols, code and findings.
URLs preserve the selected view, file, source range, trace step or experiment.
Model inputs remain in memory; the experiments do not call application services,
send notifications, mutate accounts or execute database commands. Model outcomes
illustrate the report; they are not application test results.

## Rebuild and preview

From the repository root, with the existing dependencies installed:

```sh
node docs/reviews/2026-09-23-production-review/viewer/build-data.mjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/reviews/2026-09-23-production-review
```

Open <http://127.0.0.1:8766/atlas.html>. The rebuild reads Git without checking out
or executing the application and regenerates `data.js` and `../atlas.html`.
`build-data.py` parses canonical review metadata; its default invocation delegates
to the Node builder. `atlas.config.mjs` owns source annotations, module positions,
curated workflows and model descriptions. `labs.js` implements the models.

Imports and declarations come from the installed Babel parser. The builder checks
source ranges, workflow symbols, file references and the expected finding count;
parse failures fail the command. The module graph includes type-only imports and
excludes test imports. Computed imports and framework-discovered connections may
be absent. Module findings include contextual ownership beyond line annotations.

The checked-in `.env.example` is included. Actual environment files, credentials,
database contents, migrations and installed vendor source are excluded. Vendor and
directory references from the report are identified separately from embedded files.

Explorer verification covers syntax, model rendering, source anchors and browser
navigation, including narrow layouts. Historical application checks and their
limitations remain recorded in the original report and the Evidence view.
