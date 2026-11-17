# Real-time delivery

CSK Hub uses standard SSE and Redis Streams. Better Auth authenticates the app-owned
endpoint; browsers never connect to Redis or receive broker credentials. Postgres
stores Messages, read cursors and a transactional per-User delivery outbox. Recipient
Redis streams carry only outbox IDs, with approximately 1,000 entries and 24-hour expiry.
Redis is not the source of truth: pending deliveries and scheduled deadlines live in
Postgres. Delivery runs through Next.js `after()` without a separate worker.

## Ownership

`core/realtime` owns the shared delivery system: event contracts, transactional enqueue,
Redis transport, authenticated SSE, acknowledgement handling, push fallback, retries,
retention, `after()` scheduling and the app-wide browser connection. It imports no features.

`createActivityDelivery(policy)` binds the server workflow to required feature checks for
current delivery access and authoritative read state. `src/app/api/realtime/delivery.ts`
composes the HTTP handlers with `conversationActivityPolicy` from the public `features/messaging/activity` entrypoint.
Messaging owns Conversation membership, read-cursor rules and its policy-bound dispatch
function. Other features call that dispatch entrypoint after commit; notification broadcast
owns recipient search, delivery-mode selection and queued-versus-sent results. The policy is passed
explicitly, with no global registration or permissive default for protected deliveries.

The integration suite stays in `features/activity` because it verifies the composed
Messaging/Post workflows. Transport and scheduling tests live beside their core modules.

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
Message writes do not wait for delivery. Concurrent callbacks on an instance share one
30-second processing loop per policy. A new relevant commit wakes the loop if it is waiting
for a later deadline. Each request registers its own `after()` callback to await that shared
work; expiry finishes the currently claimed wave. Draft-only Post changes, unchanged read
cursors and exact Message retries do not schedule delivery. Platform Function duration still
bounds the entire request, including `after()` work; allow sufficient time for the write,
the eight-second grace period, and push attempts.

Each wave atomically claims up to five rows with `UPDATE ... RETURNING` and a
`FOR UPDATE SKIP LOCKED` subquery, then processes them concurrently. Conversation changes
take priority over public fan-out. Up to 50 rows are processed per batch; the response loop
can run further batches within its window. Ninety-second leases coordinate instances. It waits for the next publication, push, retry or lease-expiry deadline
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

Build with `bun run build` to retain the migration check. Configure the application's
validated environment (`POSTGRES_URL`, `REDIS_URL`, `REDIS_KEY_PREFIX` and VAPID keys).
The current request-bound dispatcher needs no separate process. Its processing window is
also bounded by the host's request lifetime. Production Docker/Portainer integration and
a supervised background dispatcher remain deferred until the hosting PR is merged.

The SSE route has a 300-second Function budget and rotates its connection after four
minutes. Heartbeats occur at most every 15 seconds and native EventSource reconnects
with `Last-Event-ID`. The `ready` event carries a `reset` flag: initial connections and
invalid, future or trimmed cursors request an authoritative refresh. A retained cursor
resumes through replay without refreshing an unchanged page. Focus and network recovery
still refresh the current authorized state.
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

## Toast payload

Features provide an optional `toast: { title, description? }` on the queued ActivityChange.
The browser renders the same bounded layout for every kind. A title is literal text or a
`{ key, values? }` descriptor for the `Realtime` translation namespace; parameters may themselves
be descriptors, such as the translated missing-sender fallback. Translation happens in the
viewing browser's locale, while names and message content remain literal text. Messaging captures
its Group Conversation name and normalized snippet when sending. Broadcasts use the same payload.

Outbox `title`/`body` and push scheduling retain their existing contract; toast previews do not
replace push content. SSE normalizes older queued deliveries without a toast at its boundary.
Invalidation-only events do not need a toast.

## Notification behavior

- In the visible current Conversation, activity refreshes the timeline. The existing
  signed rendered-history token advances the read cursor and acknowledges pending
  Message notifications through that sequence.
- Elsewhere in a visible app, a linked toast acknowledges delivery without marking the
  Conversation read. Browser Web Locks and local storage deduplicate across tabs where
  available. Hidden tabs defer feedback and never acknowledge merely receiving an event.
  Deferred toasts expire at the server-supplied push deadline; returning later still refreshes
  authoritative state without presenting the stale alert.
- After an eight-second grace period, the response callback sends Web Push if no visible
  handling acknowledgement or authoritative read cursor makes it unnecessary. Handling on any
  device suppresses fallback across that User's devices. Web Push still requires an
  active subscription; in-app feedback does not. This grace-and-fallback behavior applies
  to Messages.
- Admin broadcasts retain direct bulk Web Push, with the low-level sender limiting
  concurrent provider calls. With Redis configured, they also queue in-app feedback with
  no outbox push fallback, so dispatch cannot send a second push. Broadcasts can produce
  both push and visible feedback; they do not use Message-style push suppression. Members
  without push subscriptions can still receive queued in-app feedback. Deferred broadcast
  toasts expire eight seconds after creation.
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
services and cover deferred execution, coalescing, wake/query races, retry backoff,
disabled realtime and budget expiry. Integration tests also cover batch claim leases,
concurrent delivery bounds, chat priority, direct bulk broadcast push and reset-versus-replay
handshakes. The service-worker tests run the actual script against rejected or unavailable
window navigation and verify that a target still opens.
