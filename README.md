# CSK Hub

CSK Hub is the internal web application for Chalmers Sångkör. It is intended to
be the organisation's digital hub for members, choirs, rehearsals, events, and
gigs.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and how we use ADRs.

## Current status

The project currently provides the authentication and account-management
foundation. The main user and admin pages are still placeholders; choir,
user, rehearsal, event, and gig management have not been implemented yet.

Implemented account workflows include:

- email- and username-based password sign-in
- passkey sign-in and passkey management
- two-factor authentication with TOTP, email OTP, and backup codes
- account activation and password reset
- profile username, password, passkey, two-factor, and session settings
- authenticated and admin-only route protection

## Stack

- [Next.js](https://nextjs.org/) 16 with the App Router and React 19
- [Better Auth](https://www.better-auth.com/) for authentication
- [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL
- [Bun](https://bun.sh/) for scripts and tests
- TypeScript, Tailwind CSS, and Biome

## Local development

Prerequisites: [Bun](https://bun.sh/), Docker, and OpenSSL.

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create the local environment file and generate an auth secret:

   ```bash
   cp .env.example .env
   openssl rand -base64 32
   ```

   Put the generated value in `BETTER_AUTH_SECRET`. `POSTGRES_URL_LOCAL` already
   points at the PostgreSQL container defined in `docker-compose.yml`, and
   `EMAIL_MODE=log` writes auth emails to the server log during local
   development. Leave `POSTGRES_URL_PROD` blank unless you administer
   production; see [Database targets](#database-targets).

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Apply the existing database migrations:

   ```bash
   bun run db:migrate
   ```

5. Start the development server:

   ```bash
   bun run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

### Local admin account

The development seed script currently creates `admin@example.com` with the
password `password`:

```bash
bun run db:seed-admin
```

`bun run db:seed-users` adds ten further example users with the same password.

Both are local-development conveniences only. Change the password immediately,
and do not use these credentials in a deployed environment. Seeding refuses to
run against production.

## Routes

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Authenticated home page | User |
| `/me` | Account settings | User |
| `/admin` | Admin surface (currently a placeholder) | Admin |
| `/login` | Password or passkey sign-in | Public |
| `/activate` | Set the password for an activated account | Activation session |
| `/forgot-password` | Request a password reset | Public |
| `/reset-password` | Choose a new password from a reset link | Public |
| `/two-factor` | Complete two-factor verification | Public |

There is no public sign-up flow. Accounts are created by server-side or admin
workflows.

## Database and auth schema changes

Auth models live in `src/core/db/schema/auth.ts`. If the Better Auth
configuration changes, regenerate the auth schema, create a migration, and
apply it:

```bash
bun run auth:generate
bun run db:generate
bun run db:migrate
```

To open Drizzle Studio against the current target:

```bash
bun run db:studio
```

## Database targets

Local is the default database. Nothing reaches production unless you ask it to,
so forgetting to set something is safe rather than dangerous.

`.env` holds two connection strings — `POSTGRES_URL_LOCAL` and
`POSTGRES_URL_PROD` — and `DB_TARGET` selects between them, defaulting to
`local`. Pass `DB_TARGET=prod` on the command that needs it; do not put it in
`.env`, or production becomes the ambient default again. Deployed instances
ignore both and use the connection string Vercel injects.

`POSTGRES_URL_PROD` must be the direct, non-pooling Supabase string on port
5432. The transaction pooler on 6543 cannot run migrations.

### The ops CLI

```bash
bun run ops
```

Opens an interactive menu and shows the migration status of local and
production side by side, so one screen answers whether either is behind the
migrations in `drizzle/`. From there you can run migrations, open Studio, or
seed the local database.

```bash
bun run ops --status    # print the status and exit, without the menu
DB_TARGET=prod bun run ops
```

Production has no credentials configured for most contributors; the status
simply reports `not configured` and carries on.

### Guardrails

When a command resolves to production:

- a banner names the host before anything connects, including a bare
  `bunx drizzle-kit`
- writes ask you to type `prod` to continue — `--yes` skips the prompt for CI
- seeding refuses outright and exits non-zero

Certificate verification is always on. Supabase signs with its own root rather
than a public CA, so that certificate is committed at
`src/core/config/prod-ca-2021.crt` and used by default — connecting to
production needs no certificate setup. `DB_SSL_CA` overrides it for any other
managed database. There is deliberately no switch to skip verification.

## Email configuration

Email delivery is controlled by `EMAIL_MODE`:

- `log` writes email contents to the server log. This is the local and preview
  default.
- `smtp` sends through Gmail SMTP. Configure `SMTP_HOST` (`smtp.gmail.com`),
  `SMTP_PORT` (`587`), `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`.

## Checks and useful commands

```bash
bun run tst         # run the test suite
bun run typecheck   # TypeScript checks
bun run lint        # Biome checks
bun run build       # production build
bun run pr          # tests, lint, and build
bun run ops         # database status and guarded database operations
```

The project context and architectural conventions are documented in
[`CONTEXT.md`](CONTEXT.md) and [`docs/codebase-structure.md`](docs/codebase-structure.md).
