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
bun run ops reference-data       # Choirs, Sections and fixed Groups; also with --prod
bun run ops reset                # erase the local database, migrate it and add the reference data
bun run ops seed-admin           # admin@example.com, password "password"; generated with --prod
bun run ops seed-users           # 100 verified local example accounts, including three Admins
bun run ops seed-groups          # balanced placements, groups, Positions and their history
bun run ops seed-posts           # 24 published example Posts, after seed-users
bun run ops seed-events          # example Events, Locations, a gig group, Absence reasons and Responses, after seed-groups
bun run ops seed-demo            # reference data + all of the above, after migrating

bun run ops --prod               # the menu, targeting production
bun run ops migrate --prod       # asks you to type "prod" first
bun run ops migrate --prod --yes # unattended, e.g. in CI
bun run ops grant-admin <email> --prod  # regain admin access in production
bun run ops reference-data --prod       # the shared org structure, in production
bun run ops seed-admin --prod           # first admin account in production
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
  because every environment needs the same org structure: Choirs, their Sections, continuing
  Groups and annual Groups for the current and following Organisational year. Position definitions
  live in code. It fabricates no people and only creates missing Group identities in one transaction.
- `reset` refuses outright with `--prod`, and refuses any `POSTGRES_URL` that is not a
  local database. Locally it asks before erasing; `--yes` skips the question, and without a
  terminal it refuses instead of waiting. It drops the `public` and `drizzle` schemas, runs
  every migration and creates the reference data, but seeds nothing.
- `seed-admin` against production also requires typing `prod`. It is allowed there because
  it creates one admin, `admin@example.com`, with a random password printed once to the
  terminal. If the account already exists there, its password is left unchanged. Locally the
  password is always `password`, like the other seeded accounts, and an existing local admin's
  password is reset to it.
- Every other seed refuses outright and exits non-zero with `--prod`. Those seed scripts also
  refuse any `POSTGRES_URL` that is not a local database, including when run by hand.

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
data if needed, then seeds people, placements, Posts and Events in one transaction.
It never resets the database. The individual seed commands remain available; run
`reference-data`, `seed-users`, `seed-groups`, `seed-posts`, then `seed-events` for the same dataset.

On an empty database the demo contains:

- 100 distinct named, email-verified Users, with usernames `singer001` through `singer100`.
  Sign in as `singer-001@example.com` through `singer-100@example.com`, all with password
  `password`; the first three Users are Admins. New accounts share one salted credential hash per seed run.
- 34/33/33 singers across DK, KK and MK, with 8–9 singers per Section. KK alternates
  divisions within its S/A/T/B Sections. Existing unplaced active Users are placed too;
  the seed balances around existing placements rather than moving anyone.
- Varied Choir join dates from 2021–2025, Section and division changes, independent
  self-reported Voice capabilities, and some Users who have declared none.
- Fixed annual Groups for the current and following Organisational year, the continuing
  Föräldramötet and Utantillkommittén, and example Choir teams, a gig group, and a project group. Formal Positions
  are code-controlled definitions; the basic seed leaves appointments for Admins to assign.
- 24 fictional Swedish Posts with paragraphs, headings, lists, emphasis and blockquotes,
  published by the example Admins between August 2025 and October 2026. They use the editor's
  document format and appear in the shared News feed. Their event details are demo content.
- Example Events from the coming Monday on. Each Choir has a weekly rehearsal series on its own
  weekday, a sectional (KKB, MKT1, DKS1), a Draft julkonsert and a Cancelled extra rehearsal.
  For all of CSK: the Alumnikväll gig with its gig group and Event details, the Höstsittning,
  the Januarimöte Körmöte for everyone and a room Booking, at the Locations Scania and Kårhuset.

Stable identities make these seeds repeatable: they insert missing fixtures and keep existing
passwords, profile edits and Post edits. Direct scripts also enforce the local-only
database guard. To return to the original demo after editing it, deliberately run
`bun run ops reset`, then `bun run ops seed-demo`.

## Drizzle v1 migration history

Both Drizzle packages are pinned to `1.0.0-rc.5`. Each migration now has a timestamped
folder containing `migration.sql` and a v9 `snapshot.json`; there is no shared journal.
The 18 SQL files were preserved byte for byte during conversion, including the
hand-written domains, triggers and `NULLS NOT DISTINCT` index.

Better Auth uses its `relations-v2` adapter and the matching `auth` CLI. Running
`bun run auth:generate` emits `defineRelationsPart` definitions for Drizzle v1.

The conversion repaired three metadata issues:

- The data-only `member-role-to-user` migration had no snapshot. Its snapshot repeats
  the preceding schema with its own ID, and the following snapshot points to it.
- `post-body-to-document` and `post-body-search` originally shared a second. Their
  folder timestamps were moved to the next two seconds to retain dependency order.
  Both moved out of the original second so v1 backfills their ledger names by SQL
  hash, rather than assigning both rows to the same timestamp match.
- Check and partial-index expressions were normalized by removing their own table
  qualifier before conversion. This avoids the converter's [false schema changes](https://github.com/drizzle-team/drizzle-orm/issues/6020)
  and an index rebuild that would lose the hand-written `NULLS NOT DISTINCT` behavior.

`bunx drizzle-kit check` and `bun run db:generate` should report no schema changes.
Keep the converted folders and the upgraded packages together when deploying.

The first v1 `bun run ops migrate` upgrades the database ledger, adding `name` and
`applied_at` and backfilling existing migration names. The status command and build
check can read both ledger versions without writing to either: v1 uses folder
names, while a legacy ledger is matched by SQL hash. Test the ledger upgrade on a
local copy before using the normal guarded production migration command.

## Organisation model cutover

The `20261116194645_redesign-organisation-appointments` migration requires an **empty
`group` table**. Its first statement refuses any retained Group, including archived Groups,
before changing enum values, dropping legacy tables or recording the migration as applied.
An ordinary `bun run ops migrate --prod` against existing reference Groups therefore stops
with an explicit cutover error; it does not prepare or reset the database for you.

The migration drops the old Membership, Position catalogue and holding tables without
converting their records. It does not preserve existing Group or Section identities. The
legacy enum values must still be renamed even on an empty organisation because earlier
migrations created the old PostgreSQL enum definition. Reference setup then creates fresh
Choirs, Sections, continuing Groups and annual Groups with valid organisational years.

For an intentionally disposable local database, run `bun run ops reset`, then
`bun run ops seed-demo`. Reset erases the whole local database, including Users, Posts and
Events; use it only when all of that data is disposable. Reset refuses production and
non-local database targets. Seed commands do not reset or clear existing Groups.

For a database with data to retain, prepare a separate, reviewed cutover before applying
this migration:

1. Stop application writes, take a backup and verify that it can be restored. Rehearse the
   cutover on a local copy.
2. Inventory the Groups, Sections, Choir relationships and legacy participation, plus references
   from other data such as Event organisers and Targets. Decide explicitly which data is
   discarded and which references must be retained or remapped to newly seeded Groups.
3. Prepare the empty Group table through that reviewed data plan. Do not use a blanket
   `CASCADE`, delete unrelated records or erase the migration ledger to bypass the guard.
   Users, Posts and Post reads need not be removed; an empty Group table is the prerequisite,
   not an empty database. This PR supplies no automatic production cleanup or reference remapping.
4. Verify that the Group table is empty, apply `bun run ops migrate --prod`, then run
   `bun run ops reference-data --prod`. Both commands retain their production confirmation.
   Restore planned participation and remap retained references explicitly; local demo seeding
   is unavailable in production. Check Group labels, rosters and affected Events before
   resuming writes.

If retained Group identities or participation require an in-place upgrade, implement and test
that migration separately instead of disabling this guard.

This migration replaces the earlier unmerged PR migrations. Databases that applied an earlier
version, including a pre-guard version of this same migration, will not rerun it automatically.
They require a deliberate local reset/reseed or a separately planned upgrade. Do not edit their
migration ledger to force a replay.

## Section identities

Section names are derived from the current Choir name and the Section Voice; they are never
seeded as editable names. Reference data matches existing Sections by owning Choir and Voice,
while retaining the original stable UUID tokens for newly created reference Sections. A Choir
rename therefore changes Section labels without replacing their identities or participation.
