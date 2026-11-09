# Deployment

CSK Hub runs as a Docker Compose stack on GUD's Portainer host. The stack is
[`docker-compose.yml`](../docker-compose.yml) at the repository root (Portainer needs it
there to build the images) and has three services:

| Service | Image | What it does |
| --- | --- | --- |
| `db` | `postgres:17-alpine` | The database. Its data lives in the `db_data` volume, and it publishes no port. |
| `migrate` | `ghcr.io/herr-ek/csk-hub-migrate` | Runs on every deploy before the app: applies pending migrations, creates any missing reference data, then exits. |
| `app` | `ghcr.io/herr-ek/csk-hub` | The Next.js server on port 3000. It starts only after `migrate` has succeeded. |

Both images come from the [`Dockerfile`](../Dockerfile) (`--target app` and `--target migrate`).
Portainer can build them from the repository, or pull the ones
[`publish-images.yml`](../.github/workflows/publish-images.yml) publishes to GHCR on every push
to `master` (tags `latest` and `sha-<short commit>`).

## First deployment

1. **Make the GHCR packages public**, once, after the first workflow run: on GitHub,
   Packages → `csk-hub` and `csk-hub-migrate` → Package settings → Change visibility. The
   repository is public, so Portainer then needs no registry credentials.
2. **Create the stack** in Portainer: Stacks → Add stack → Repository. Use
   `https://github.com/herr-ek/csk-hub`, reference `refs/heads/master`, and compose path
   `docker-compose.yml`.
3. **Set the environment variables.** Load [`stack.env.example`](../stack.env.example) with
   "Load variables from .env file" and fill in every value. Required:
   - `POSTGRES_PASSWORD`
   - `BETTER_AUTH_URL`
   - `BETTER_AUTH_SECRET`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - the `SMTP_*` values while `EMAIL_MODE=smtp`
4. **Deploy.** `migrate` should exit with code 0, and `app` should become healthy.
5. **Route the public hostname to the app** with GUD's reverse proxy, pointed at `APP_PORT`.
   - Terminate HTTPS at the proxy. `BETTER_AUTH_URL` must be exactly the public origin
     (`https://…`, no trailing slash); email links and passkeys are bound to it.
   - Pass the `Host` and `X-Forwarded-*` headers through.
   - Turn off response buffering (for nginx, `proxy_buffering off` or the
     `X-Accel-Buffering: no` header). Streamed pages otherwise arrive all at once.
6. **Create the first Admin.** See the open question below.

## Updating

A deploy is: get the new images, then recreate the stack. Compose restarts `migrate` first, and
`app` waits for it. Any of these works with the stack as it is:

- **Manually:** in Portainer, open the stack → "Pull and redeploy", with "Re-pull image" checked.
- **Portainer webhook (Business Edition):** enable the stack's webhook and store its URL in the
  `PORTAINER_WEBHOOK_URL` repository secret. The workflow's `redeploy` job calls it after
  publishing.
- **Portainer GitOps updates:** enable automatic updates on the stack (polling or webhook) with
  "Re-pull image". Portainer redeploys when `master` changes.

Do not use Watchtower here. It restarts `app` with the new image, but it does not run
`migrate` again, so the new code would start against the old schema.

To pin or roll back a release, set `IMAGE_TAG=sha-<short commit>` and redeploy. Migrations
only move forward: rolling back past a schema change needs a database restore.

## Operations

Production database commands run inside the stack, where `POSTGRES_URL` already points at
`db`. Open a console on a `migrate` container from Portainer (or
`docker compose run --rm migrate sh`) and run the ops CLI **without** `--prod`:

```bash
bun run ops status
bun run ops grant-admin someone@example.org
bun run ops reference-data
```

Seeding and `reset` refuse to run here, because `db` is not a local host. The image holds
only the bundled CLI and the migrations, without development tools, so `migrate` and `studio`
stop with an error too. Migrations run on every deploy; to run them again now, start the
`migrate` service again (`docker compose up migrate`).

### Backups

The data exists only in the `db_data` volume. Take regular dumps from the `db` container:

```bash
docker compose exec -T db pg_dump -U csk_hub -Fc csk_hub > csk-hub-$(date +%F).dump
```

Restore into an empty database with `pg_restore -U csk_hub -d csk_hub --clean --if-exists`.
Agree with GUD where the dumps are kept and how often they are taken.

### Open question: the first Admin

A fresh database has no Users, and there is no public sign-up. `seed-admin` refuses
non-local databases, and `grant-admin` needs an existing User. The team still has to decide
how the first account is created, for example with a guarded `create-admin` ops command.

## Trying the stack locally

```bash
cp stack.env.example stack.env   # fill in; BETTER_AUTH_URL=http://localhost:3000, EMAIL_MODE=log
docker compose -p csk-hub-stack --env-file stack.env up --build
```

`-p` keeps it apart from the development database in `docker-compose.dev.yml`.
