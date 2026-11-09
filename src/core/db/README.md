# Database

The application's database client (`index.ts`), Drizzle schemas (`schema/`) and
`connection.ts`, which says whether a connection string points at a local database.

## The application contract

The application consumes one variable: `POSTGRES_URL`.
- Locally it comes from `.env` and points at the container in `docker-compose.dev.yml`.
- In the deployed stack, `docker-compose.yml` sets it to the stack's own `db` service.

Application code never chooses between local and production, and never reads
`POSTGRES_URL_PROD`. That choice belongs to the ops CLI in `scripts/ops`.

## TLS

Every client passes the connection string to `pg` unchanged: the application, `drizzle.config.ts`,
the ops CLI and the test harness. The URL's own `sslmode` therefore decides TLS:

- No `sslmode` connects in plaintext. This is right for the development container and for the
  stack's `db`, which is reachable only on the stack's private network and publishes no port.
- `sslmode=verify-full` verifies the server against the system trust store. Use it if the
  database ever moves to a separate host.

There is no TLS code of our own. Any change of policy is made in the connection string.

## Local-only guards

`isLocalDatabase()` treats only `localhost`, `127.0.0.1` and `[::1]` as local. Seeding, `reset`
and the throwaway test databases refuse anything else, including the stack's `db` host, so none
of them can run against the deployed database.
