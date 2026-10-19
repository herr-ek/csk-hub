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
bun run ops seed-users           # 100 verified local example accounts, including three Admins
bun run ops seed-groups          # balanced placements, groups, Positions and their history
bun run ops seed-posts           # 24 published example Posts, after seed-users
bun run ops seed-demo            # reference data + all of the above, after migrating

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
  Styret, the Gigmästeri and the Position catalogue), and it fabricates no people. It only creates what
  is missing, matching existing groups and Positions by name, in one transaction.
- `reset` refuses outright with `--prod`, and refuses any `POSTGRES_URL` that is not a
  local database. Locally it asks before erasing; `--yes` skips the question, and without a
  terminal it refuses instead of waiting. It drops the `public` and `drizzle` schemas, runs
  every migration and creates the reference data, but seeds nothing.
- Seeding refuses outright and exits non-zero with `--prod`. The seed scripts also refuse
  any `POSTGRES_URL` that is not a local database, including when run by hand.

## Production build check

The `prebuild` hook in `package.json` runs `scripts/ops/pre-build.ts`, so `bun run build`
checks the migrations before `next build`. On a production build (`VERCEL_ENV=production`)
it compares the migrations on disk with the ledger of the database the deployment will use
(the `POSTGRES_URL` Vercel injects), the same comparison `status` makes. If any migration is
pending, the build fails and lists them. Preview and local builds skip the check.

Vercel runs the project's `build` script, which triggers the hook. A Build Command override
in the Vercel dashboard must stay `bun run build`; a direct `next build` would skip it.

The check fails closed: the build stops if `POSTGRES_URL` is unset, or if connecting or
reading the ledger takes longer than 10 seconds. It keeps no state, so after a failed build
you can apply the migrations and redeploy the same commit:

```bash
bun run ops migrate --prod   # then "Redeploy" the failed deployment in Vercel, or push again
```

TLS verification follows the shared policy in `src/core/db/tls.ts`; see
`src/core/db/README.md`.

## Local demo data

After `bun run ops migrate`, run `bun run ops seed-demo`. It creates the shared reference
data if needed, then seeds people, placements, group history and Posts in one transaction.
It never resets the database. The individual seed commands remain available; run
`reference-data`, `seed-users`, `seed-groups`, then `seed-posts` for the same dataset.

On an empty database the demo contains:

- 100 distinct named, email-verified Users, with usernames `singer001` through `singer100`.
  Sign in as `singer-001@example.com` through `singer-100@example.com`, all with password
  `password`; the first three Users are Admins. New accounts share one salted credential hash per seed run.
- 34/33/33 singers across DK, KK and MK, with 8–9 singers per Section. KK alternates
  divisions within its S/A/T/B Sections. Existing unplaced active Users are placed too;
  the seed balances around existing placements rather than moving anyone.
- Varied Choir join dates from 2021–2025, Section and division changes, independent
  self-reported Voice capabilities, and some Users who have declared none.
- CSK-wide and Choir-owned committees, gig groups, roddgrupper, festgrupper and rephelgsgrupper,
  with helpers, former members, rejoins and Position handovers. Six additional groups are
  archived, including an old Board and completed concert/rephelg projects.
- Choir Dirigenter, Notfiskaler, Konsertmästare and Gigmästare; a Stämförälder for each
  Section; a current Board with one elected Position per member. Board offices are linked
  to their responsibility groups, and each Choir's Gigmästare also serves in the Gigmästeri,
  respecting the Position catalogue's Group limits. Some singers hold multiple non-Board Positions.
- 24 fictional Swedish Posts with paragraphs, headings, lists, emphasis and blockquotes,
  published by the example Admins between August 2025 and October 2026. They use the editor's
  document format and appear in the shared News feed. Their event details are demo content.

Stable identities make these seeds repeatable: they insert missing fixtures and keep existing
passwords, profile edits and Post edits. A conflicting existing Position assignment fails the
demo transaction rather than displacing its holder. Direct scripts also enforce the local-only
database guard. To return to the original demo after editing it, deliberately run
`bun run ops reset`, then `bun run ops seed-demo`.
