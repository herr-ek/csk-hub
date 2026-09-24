# Database

The application's database client (`index.ts`), Drizzle schemas (`schema/`) and the TLS
policy for reaching a managed database (`tls.ts`).

## The application contract

The application consumes one variable: `POSTGRES_URL`. Locally it comes from `.env` and
points at the Docker container; on Vercel it is the connection string the platform
injects. Application code never chooses between local and production and never reads
`POSTGRES_URL_PROD` — that choice belongs to the ops CLI in `scripts/ops`.

## Verified TLS

`tls.ts` answers one question: how is a connection string dialled securely? Every
non-local connection — the deployed app, `drizzle.config.ts` and the ops CLI alike — is
verified against the Supabase root CA with `rejectUnauthorized: true`. There is
deliberately no switch to skip verification.

Any `sslmode` in the connection string is removed before connecting, because `pg` lets
it override explicit `ssl` options, which would silently discard the CA.

### The committed CA

`certs/supabase-root-2021.crt` is Supabase's root certificate. Supabase signs its
database certificates with this root rather than a public CA, so no system trust store
contains it. It is public trust material, identical for every Supabase project, and is
committed rather than kept in `.env`.

- Provenance: downloaded from the Supabase dashboard (Database settings → SSL
  Configuration).
- Subject: `CN=Supabase Root 2021 CA, O=Supabase Inc`.
- Expires: 26 April 2031. Replace it before then.

`next.config.ts` adds it to the server file trace, because it is read at runtime rather
than imported.

## Direct versus pooled connections

Supabase exposes a transaction pooler on port 6543 and a direct connection on port 5432.
The deployed app can use the pooled string Vercel injects. Migrations cannot run through
the transaction pooler, so the production URL the ops CLI uses (`POSTGRES_URL_PROD`) must
be the direct connection.
