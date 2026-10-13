# Ops CLI

`bun run ops` is the single entrypoint for database operations: migration status,
migrations, Drizzle Studio, granting admin and local seeding. There are no alternative
`db:*` scripts to remember; `db:generate` and `auth:generate` remain because they work
offline.

```bash
bun run ops                      # status, then an interactive menu
bun run ops status               # local and production migration status side by side
bun run ops migrate              # apply pending migrations locally
bun run ops studio               # Drizzle Studio against the local database
bun run ops grant-admin <email>  # make an existing user an admin
bun run ops seed-org-structure   # all local groups, Positions and user placement
bun run ops reset                # erase local data, migrate and seed organisation structure
bun run ops seed-admin           # local admin account
bun run ops seed-users           # ten local example users

bun run ops --prod               # the menu, targeting production
bun run ops migrate --prod       # asks you to type "prod" first
bun run ops migrate --prod --yes # unattended, e.g. in CI
bun run ops grant-admin <email> --prod  # regain admin access in production
bun run ops seed-org-structure --prod   # shared structure only; requires confirmation
```

## Targets

This directory is the only code that chooses a database. Local, from `POSTGRES_URL`, is
the default. Production is reached only with `--prod`, which reads `POSTGRES_URL_PROD`.

`POSTGRES_URL_PROD` belongs only in a maintainer's own untracked `.env`. It must be the
direct Supabase connection on port 5432, not the transaction pooler. Without it, the
status reports production as `not configured` and carries on.

When the CLI launches drizzle-kit or a seed script, it passes the selected URL to the
child as `POSTGRES_URL`. `drizzle.config.ts` only reads that already-resolved value.

## Guardrails

- Every production command prints a banner that names the host before it connects.
- Production migrations require typing `prod`. `--yes` skips the prompt, and without a
  terminal they refuse instead of waiting.
- `grant-admin` against production also requires typing `prod`. It is the way to
  regain admin access, and it is allowed in production because it creates no account
  and no credentials. The user must already exist; their existing roles are kept, and
  a deactivated user stays deactivated.
- `seed-org-structure` runs the entire organisation seed in one transaction and is safe
  to repeat. Locally it creates the shared Choirs, Sections, Styret, Gigmästeri and Position catalogue,
  adds example groups and places active users with no membership history in a Choir and
  a Section. Existing structure and memberships are preserved. Concurrent runs serialize
  with a transaction-scoped advisory lock. A local target refuses a non-local URL.
- `seed-org-structure --prod` requires typing `prod` (or `--yes` unattended). It creates
  only the shared structure; it never creates example groups, users or memberships.
- `reset` refuses outright with `--prod`, and refuses any `POSTGRES_URL` that is not a
  local database. Locally it asks before erasing; `--yes` skips the question, and without a
  terminal it refuses instead of waiting. It drops the `public` and `drizzle` schemas, runs
  every migration and seeds the organisation structure, including local example groups.
  It creates no users. Create users with `seed-admin` / `seed-users`, then rerun
  `seed-org-structure` to place them.
- `seed-admin` and `seed-users` refuse outright and exit non-zero with `--prod`. Their
  scripts also refuse any non-local `POSTGRES_URL`, including when run by hand.

`seed-org-structure` replaces the former `reference-data` and `seed-groups` commands;
there is no prerequisite structure command to run first.

TLS verification follows the shared policy in `src/core/db/tls.ts`; see
`src/core/db/README.md`.
