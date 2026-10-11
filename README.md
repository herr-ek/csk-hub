# CSK Hub

CSK Hub is the internal web application for Chalmers Sångkör. It is intended to
be the organisation's digital hub for members, choirs, rehearsals, events, and
gigs.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and how we use ADRs.

## Current status

The project provides authentication and account management, shared member
profiles and a searchable member directory. Choir and Group structure is modelled
in the database; its management screens, rehearsals, events and gigs are still
under development.

Implemented User workflows include:

- email- and username-based password sign-in
- passkey sign-in and passkey management
- two-factor authentication with TOTP, email OTP, and backup codes
- account activation and password reset
- profile username, password, passkey, two-factor, and session settings
- authenticated and admin-only route protection
- shared profiles with Choirs, Sections, Groups, Positions and Voice capabilities
- self-reported Voice capabilities edited on a dedicated profile page
- a searchable, paginated member directory

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

   Put the generated value in `BETTER_AUTH_SECRET`. `POSTGRES_URL` already
   points at the PostgreSQL container defined in `docker-compose.yml`, and
   `EMAIL_MODE=log` writes auth emails to the server log during local
   development. Leave `POSTGRES_URL_PROD` blank unless you administer
   production.

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Apply the existing database migrations:

   ```bash
   bun run ops migrate
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
bun run ops seed-admin
```

`bun run ops seed-users` adds ten further example users with the same password.

Both are local-development conveniences only. Change the password immediately,
and do not use these credentials in a deployed environment. Seeding refuses to
run against production.

`bun run ops reference-data` creates the Choirs MK, DK and KK with their Sections,
Styret and the Positions; run it once after migrating (it also runs against production
with `--prod`). `bun run ops reset` starts the local database over: it erases it, migrates
it from scratch and creates the reference data. `bun run ops seed-groups` then adds example groups and places every user
who is in no group yet in a Section. Running either again changes nothing.

## Routes

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Authenticated home page | User |
| `/admin` | Admin surface (currently a placeholder) | Admin |
| `/admin/org-structure` | Choirs and Sections: placing singers and changing their Voice | Admin |
| `/admin/org-structure/groups` | Every other group, its Members and Positions, and the Position catalogue | Admin |
| `/me` | Own profile | Active User |
| `/me/edit` | Edit own Voice capabilities | Active User |
| `/me/settings` | Account settings | User |
| `/members` | Searchable directory of other members | Active User |
| `/members/[memberId]` | Shared profile of an active User | Active User |
| `/admin` | Administration overview | Admin |
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
bun run ops migrate
```

## Database operations

Use `bun run ops` for all database operations: migration status, migrations,
Drizzle Studio and local seeding. It targets the local database unless you pass
`--prod`. See [`scripts/ops/README.md`](scripts/ops/README.md) for commands and
production safeguards, and [`src/core/db/README.md`](src/core/db/README.md) for
how the application connects.

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

See [`GLOSSARY.md`](GLOSSARY.md) for project context and the
[contribution guide](CONTRIBUTING.md#which-guide-to-read) for the task-based index
of code conventions and module guides.
