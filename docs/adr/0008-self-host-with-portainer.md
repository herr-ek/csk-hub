---
status: proposed
---

# Self-host with Portainer

CSK Hub moves from Vercel and Supabase to a Docker Compose stack on GUD's Portainer host. The
stack runs the app, its own PostgreSQL and a one-shot `migrate` service. Vercel-only features
(preview deployments, the production build migration check, Web Analytics) are removed rather
than emulated.

The database is reachable only on the stack's private network, so connections use plaintext
by default. TLS is governed by the connection string's own `sslmode`; the Supabase CA policy is
gone. Migrations and the reference data are applied automatically on every deploy, before the
app starts, in place of the guarded manual `ops migrate --prod`. The ops CLI is still the way
to run them by hand.

## Consequences

A deploy cannot reach Users before its schema, because `app` starts only after `migrate`
succeeds. A failed migration stops the deploy before the new app starts. Migrations are forward-only, so rolling back past a schema change needs a restore.

Update mechanisms must recreate the whole stack. Tools that restart single containers, such as
Watchtower, would skip `migrate`.

Backups are now our responsibility and not the platform's. Bootstrapping the first Admin in a
fresh database is not yet solved. This draft records the design, not team approval.
