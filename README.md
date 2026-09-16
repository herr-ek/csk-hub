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
   cp .env.example .env.local
   openssl rand -base64 32
   ```

   Put the generated value in `BETTER_AUTH_SECRET`. The example configuration
   points at the PostgreSQL container defined in `docker-compose.yml` and uses
   `EMAIL_MODE=log`, so auth emails are written to the server log during local
   development.

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

### Running against a local database without docker

When `.env` points at a deployed database (for example a Supabase project), the
`:local` script variants run the same commands against a PostgreSQL instance on
this machine instead, leaving the default scripts untouched:

```bash
cp .env.localdb.example .env.localdb   # adjust POSTGRES_URL for your instance
bun run db:migrate:local
bun run dev:local
bun run tst:local
```

Each variant layers `.env.localdb` on top of `.env`, so only the variables that
differ locally — the connection string in practice — need to be listed there.
Anything else, such as `BETTER_AUTH_SECRET`, still comes from `.env`.

The file is deliberately *not* called `.env.local`: Bun and Next.js load that
name automatically and it takes precedence over `.env`, which would redirect the
plain `dev` and `db:migrate` scripts as well. For the same reason the variants
delegate through `bun run <script>` rather than `bun x <binary>` — `bun x`
re-reads `.env` in the child process and discards the override.

A native install works as well as the Docker container; point `POSTGRES_URL` at
whichever is listening (`docker-compose.yml` uses port 5433, a default native
install 5432) and create the role and database once:

```sql
CREATE ROLE csk_hub LOGIN PASSWORD 'csk_hub' CREATEDB;
CREATE DATABASE csk_hub OWNER csk_hub;
```

### Local admin account

The development seed script currently creates `admin@example.com` with the
password `password`:

```bash
bun run db:seed-admin
```

This is a local-development convenience only. Change the password immediately
and do not use these credentials in a deployed environment.

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

To open Drizzle Studio against the configured database:

```bash
bun run db:studio
```

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
```

The project context and architectural conventions are documented in
[`CONTEXT.md`](CONTEXT.md) and [`docs/codebase-structure.md`](docs/codebase-structure.md).
