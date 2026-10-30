# Real-time delivery

CSK Hub uses standard SSE and Redis Streams. Better Auth authenticates the app-owned
endpoint; browsers never connect to Redis or receive broker credentials. Postgres
stores Messages, read cursors and a transactional per-User delivery outbox. Recipient
Redis streams carry only outbox IDs, with approximately 1,000 entries and 24-hour expiry.
Redis is not the source of truth: pending deliveries and scheduled deadlines live in
Postgres. Delivery runs through Next.js `after()` without a separate worker.

## Setup

1. Run `docker compose up -d` locally to start PostgreSQL and Redis 7.
2. Run `bun run ops migrate` to apply the delivery migration and earlier migrations.
3. Configure `REDIS_URL=redis://localhost:6379` and
   `REDIS_KEY_PREFIX=csk-hub-development` in `.env`. Leave `REDIS_URL` unset to disable
   realtime. Use a different database and prefix in production, preview and development.
4. Run `bun run dev`. No additional process is required.

## Scheduling and best-effort recovery

A feature saves its data and delivery records in one Postgres transaction. After commit,
`scheduleActivityDispatch()` uses Next.js `after()` to attempt delivery after the response.
The response does not wait for delivery. Each callback opens a 30-second processing window,
finishing an in-flight delivery when that window ends. Platform Function duration still
bounds the entire request, including `after()` work; allow sufficient time for the write,
the eight-second grace period, and push attempts.

The callback processes bounded batches with row locks and 90-second leases to coordinate
concurrent requests. It waits for the next publication, push, retry or lease-expiry deadline
within its window. Transient database failures retry with backoff; publication and push
failures retain their own retry deadlines. Redis publication failures do not prevent due
Web Push. No Redis wakeup stream, independent worker, durable queue or cron is required.

This is best-effort delivery, not a delivery-rate guarantee. If a Function crashes after
commit, times out, or exhausts its window, pending work stays in Postgres. A subsequent
activity-producing request can recover eligible work. While the app is idle, nothing retries
it: live feedback or push may be delayed or missed. Browser reconnect/focus recovery still
refreshes authoritative state, but does not itself drain the outbox. Stored Messages and
read cursors are unaffected by notification delivery failures.

Retention runs opportunistically at the start of a callback, at most hourly per warm
instance. Records older than seven days expire, including unfinished deliveries; cleanup
can be later when the app is idle. `realtime.delivery.expired` reports unfinished records
removed. Monitor `realtime.dispatch.batch`, `realtime.dispatch.retry`,
`realtime.dispatch.interrupted`, publication/push retry logs, `realtime.retention.failed`,
and the age of pending outbox records. Logs do not include message text or credentials.

Independent recovery and dedicated-server process supervision are deferred to
[issue #134](https://github.com/herr-ek/csk-hub/issues/134). A future runner can reuse
the outbox, leases, dispatch and deadline logic.

## Deployment

Use a reachable Redis 7+ server supporting standard `EVAL`, `XADD`, `XREAD`,
`XREVRANGE` and `EXPIRE`. Use authenticated TLS (`rediss://`) for remote Redis, and
place it near the application and database. Each open browser stream owns a blocking
Redis connection. Size connection capacity for concurrent tabs and devices, plus short-lived
publisher connections. Browser delivery uses independent cursors, not a consumer group
that would divide events between a User's tabs.

On Vercel, `vercel.json` enables Fluid Compute and retains the migration-checking
`bun run build`. Configure the same application's validated environment (`POSTGRES_URL`,
`REDIS_URL`, `REDIS_KEY_PREFIX` and VAPID keys). No worker container, dispatch endpoint,
bearer secret or deployment-protection bypass is needed. Next.js `after()` also runs with
`next start` on a dedicated server; independent recovery remains future work.

The SSE route has a 300-second Function budget and rotates its connection after four
minutes. Heartbeats occur at most every 15 seconds and native EventSource reconnects
with `Last-Event-ID`. Initial connection, reconnect, focus and network recovery refresh
the current authorized server-rendered state, covering trimmed history or Redis loss.
Redis failures do not roll back a committed Message: publication retries within the
callback window, and due offline push can still proceed independently. Slow readers are
disconnected when the stream buffer exceeds its bounded capacity.

If Redis is unavailable when establishing a stream, the endpoint returns a short valid
SSE response with a five-second retry interval and closes it. This keeps native browser
reconnection active; returning an HTTP error could permanently stop EventSource instead.
There is currently no disconnected-status banner or fallback browser polling. Open
screens can remain stale during an outage; ordinary database reads and writes continue.

Each stream checks the underlying session and account, bypassing the Better Auth cookie
cache, at connection, heartbeat and before exposing a received batch. Message-related
events also recheck current Conversation access. Impersonation cannot subscribe or
acknowledge on another User's behalf. Redis payloads contain no Message text.

## Notification behavior

- In the visible current Conversation, activity refreshes the timeline. The existing
  signed rendered-history token advances the read cursor and acknowledges pending
  Message notifications through that sequence.
- Elsewhere in a visible app, a linked toast acknowledges delivery without marking the
  Conversation read. Browser Web Locks and local storage deduplicate across tabs where
  available. Hidden tabs defer feedback and never acknowledge merely receiving an event.
- After an eight-second grace period, the response callback sends Web Push if no visible
  handling acknowledgement or authoritative read cursor makes it unnecessary. Handling on any
  device suppresses fallback across that User's devices. Web Push still requires an
  active subscription; in-app feedback does not.
- Acknowledgement-versus-push races, or a crash after provider acceptance but before
  recording success, can cause a duplicate. The stable notification tag helps browsers
  replace duplicates. Retries are best-effort within the callback window; provider acceptance
  cannot establish that the operating system displayed a notification.
- Outbox claims expire after 90 seconds, failed work backs off up to 60 seconds, and
  delivery records expire after seven days. Monitor `realtime.*` logs and pending work
  during outages. Pending work requires a later activity request to resume after its
  callback ends; database backups remain separate operational work.

Unread state propagates across tabs/devices, including sending a Message. Post publication,
editing and unpublication refresh the feed and badges without exposing Draft content.
A one-shot timer handles the 30-day unread horizon and future publication timestamps.
Refreshing an older Message-history page preserves that window, composer and scroll;
new activity offers a link to the current Conversation.

## Verification

`bun tst` includes a process-isolated integration suite against a newly created local
throwaway Postgres database and a unique Redis key prefix. Start both local services to
run those tests; they skip when either is unavailable. Tests cover atomic enqueue,
send retries, live SSE/replay, acknowledgement privacy, unread semantics, concurrent
dispatch, broker failure, Group departure, revoked sessions, Post changes, response callbacks,
the eight-second push grace, acknowledgement during that grace, and recovery on a later
dispatch after an earlier processing window expires. Scheduler tests run without local
services and cover deferred execution, retry backoff, disabled realtime and budget expiry.
