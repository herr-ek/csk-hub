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
bun run ops reference-data       # Choirs, Sections, Styret and Positions; also with --prod
bun run ops reset                # erase the local database, migrate it and add the reference data
bun run ops seed-admin           # local admin account
bun run ops seed-users           # ten local example users
bun run ops seed-groups          # example groups, and a Section for every unplaced user

bun run ops --prod               # the menu, targeting production
bun run ops migrate --prod       # asks you to type "prod" first
bun run ops migrate --prod --yes # unattended, e.g. in CI
bun run ops grant-admin <email> --prod  # regain admin access in production
bun run ops reference-data --prod       # the shared org structure, in production
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
- `reference-data` against production also requires typing `prod`. It is allowed there
  because every environment needs the same org structure (the Choirs, their Sections,
  Styret and the Position catalogue), and it fabricates no people. It only creates what
  is missing, matching existing groups and Positions by name, in one transaction.
- `reset` refuses outright with `--prod`, and refuses any `POSTGRES_URL` that is not a
  local database. Locally it asks before erasing; `--yes` skips the question, and without a
  terminal it refuses instead of waiting. It drops the `public` and `drizzle` schemas, runs
  every migration and creates the reference data, but seeds nothing.
- Seeding refuses outright and exits non-zero with `--prod`. The seed scripts also refuse
  any `POSTGRES_URL` that is not a local database, including when run by hand.

TLS verification follows the shared policy in `src/core/db/tls.ts`; see
`src/core/db/README.md`.
