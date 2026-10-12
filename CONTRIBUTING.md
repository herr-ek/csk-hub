# Contributing to CSK Hub

See the [README](README.md) for local setup and checks.
We track work in [GitHub Issues](https://github.com/herr-ek/csk-hub/issues).

## Which guide to read

Read the guides and sections relevant to the task. Follow their conventions when
changing the code they cover; loading every guide before every edit is unnecessary.

| Task | Guide |
| --- | --- |
| Writing or reviewing code, naming files or migrations, documenting APIs | [Code style](docs/code-style.md) |
| Adding or reorganizing modules, changing dependencies, composing screens, choosing tests | [Codebase structure](docs/codebase-structure.md) |
| Adding user-facing copy, changing translations or locale behavior | [Internationalization](src/core/i18n/README.md) |
| Changing database connections or TLS policy | [Database infrastructure](src/core/db/README.md) |
| Running or changing migrations, Studio, or seeding | [Database operations](scripts/ops/README.md) |
| Changing domain concepts or making architectural decisions | [Project context](CONTEXT.md), applicable [ADRs](docs/adr/), and the ADR guidance below |
| Working on a feature with its own guide | That feature's `README.md`, such as [rich text](src/features/rich-text/README.md) |

## Architectural decision records

We use [ADRs](docs/adr/) to remember important architectural decisions and why
we made them. Feel free to draft an ADR before the team has discussed it.
Before merging, the team should have discussed and agreed on the decision.
A merged ADR means that discussion has happened, wherever it took place.
A conversation with your agent doesn't replace the team discussion.

Keep ADRs short: explain what we decided, why, and any tradeoffs worth knowing
about. Use issues for planning future work.

Until the ADR is merged to `master`, keep references to it within the branch
and its PR. Elsewhere, including issues and other PRs, link to the discussion
or introducing PR instead. Once merged, link directly to the ADR on `master`.
