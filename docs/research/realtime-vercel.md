# Real-time updates on Vercel: research

Implementation uses the application-owned SSE/Redis transport with best-effort delivery
through Next.js `after()`. Independent retry and scheduling are deferred until dedicated
server hosting; the durability recommendations below are future work. See
[the current setup and behavior guide](../../src/core/realtime/README.md). The repository
observations below describe the pre-implementation state researched on 2026-10-26.

Researched 2026-10-26. These are findings and a provisional recommendation, not an
accepted architectural decision. No application behavior or infrastructure was changed.

## Recommendation

The requested behavior is feasible on Vercel. Keep Message writes and authorization in
the application and Postgres; add a shared real-time transport for live invalidation,
Conversation updates, and notification feedback. Use one connection per signed-in tab
across the application, rather than one connection per badge or component.

Updated after the User clarified that Supabase Realtime and Ably are excluded: prefer
**an application-owned SSE endpoint with a standard Redis broker**, independently hosted
from the application database. Continue using Better Auth and authenticated HTTP writes.
The browser receives application-defined events through native `EventSource`; it does
not need a database-vendor SDK or a vendor-specific real-time token. A hosted Redis
service or a self-hosted instance can implement the same required Redis commands.
This is a recommendation, not an accepted architectural decision.

Separate three responsibilities: database persistence and the durable outbox; the broker
that fans events across app instances; and SSE delivery to authenticated browsers.
Changing the Postgres host should not require changing browser subscriptions or the
event contract. Changing database engines remains a separate migration: the existing
application already relies on PostgreSQL transactions, locks and SQL behavior.

For live invalidation, Redis Pub/Sub can carry disposable wakeups while the database
remains authoritative; Redis documents at-most-once delivery, so lost subscriptions
need reconnect reconciliation. If bounded transport replay is required, Redis Streams
with independent reader cursors and blocking `XREAD` is another standard option.
Do not use a shared consumer group for browser fan-out: connected recipients each need
their event, rather than having one consumer claim it. Neither option removes durable
notification retry and push-fallback requirements.
[Redis Pub/Sub semantics](https://redis.io/docs/latest/develop/pubsub/),
[Redis blocking stream reads](https://redis.io/docs/latest/commands/xread/).

For switching only between PostgreSQL hosts, native `LISTEN`/`NOTIFY` is also portable
and can avoid a separate broker. It needs a dedicated session connection, unavailable
through transaction pooling, and it offers no disconnected-client replay. Given the
documented pooled deployment and the goal of separating real-time delivery from the
database, it is an alternative rather than the recommendation.
[PostgreSQL LISTEN](https://www.postgresql.org/docs/current/sql-listen.html),
[PgBouncer pooling compatibility](https://www.pgbouncer.org/features.html).

## Vercel support has changed

Vercel's June 22, 2026 announcement introduced native WebSocket server support in public
beta. Current WebSocket documentation supports it on all plans with Fluid compute.
An individual connection stays on one Function instance; reconnects can reach another
instance. Shared presence, rooms, and cross-instance delivery therefore need external
state and coordination. A Postgres row cannot itself hold or route a live socket.
[Announcement](https://vercel.com/changelog/websocket-support-is-now-in-public-beta),
[current WebSocket documentation](https://vercel.com/docs/functions/websockets).

The current Next.js integration uses `upgradeWebSocket()` from `@vercel/functions`
3.10.0 or later. Older examples use its experimental predecessor; implementation should
follow the current API and locally installed Next.js guides. Vercel's official
[Next.js chat and Redis walkthrough](https://vercel.com/kb/guide/real-time-chat-websockets)
is useful for cross-instance coordination, but its public-room identity and authorization
model are not appropriate for CSK Hub's private Conversations.

SSE also works through streaming Function responses. It is server-to-browser only;
normal authenticated HTTP requests can continue to send Messages and acknowledge
updates. SSE and WebSockets are alternative transports: an SSE event is not sent over a
WebSocket. [Vercel streaming](https://vercel.com/docs/functions/streaming-functions),
[SSE standard](https://html.spec.whatwg.org/dev/server-sent-events.html).

Neither transport gives an indefinitely running Vercel Function. With Fluid compute,
Hobby has a 300-second maximum; Pro and Enterprise have an 800-second generally
available maximum and a per-function 1,800-second extended beta on supported runtimes.
Secure Compute and Static IPs remain capped at 800 seconds during that beta. Plan for
reconnects and state reconciliation regardless of the selected duration.
[Current duration configuration and limits](https://vercel.com/docs/functions/configuring-functions/duration).

CPU billing pauses while waiting for I/O, but provisioned memory, invocations, and
applicable transfer remain cost factors. Long-lived idle connections are not universally
free. Budget from concurrent tabs/devices and connected hours, fan-out, heartbeat and
reconnect traffic, and recovery reads—not only the number of Messages sent.
[Vercel Function pricing](https://vercel.com/docs/functions/usage-and-pricing).

## Transport and provider comparison

The managed services below were researched before the portability preference was
clarified. Supabase Realtime and Ably are excluded from the current recommendation.
Upstash-specific Realtime APIs are also unnecessary for the standard SSE/Redis design.

| Option | What it provides | What CSK Hub still owns |
| --- | --- | --- |
| Supabase private Broadcast | Managed browser WebSockets; server REST or database-triggered events; private-topic authorization | Better Auth JWT bridge, RLS policies, token lifecycle, current recipient selection, recovery and push policy |
| Ably Pub/Sub | Managed connections, scoped token capabilities, presence, temporary connection recovery | Session-to-token endpoint, event publishing, longer-gap reconciliation, notification acknowledgements and fallback |
| Upstash Realtime | Redis Streams and SSE, typed events, endpoint middleware, automatic reconnect/replay | Vercel stream endpoint and its usage, Better Auth checks, shared active-view tracking, durable notifications |
| Native Vercel WebSocket/SSE plus Redis | Direct control over transport and relay | Distributed connection lifecycle, auth refresh, backoff, cursor/replay handling, presence expiry, capacity and operations |

### Supabase: useful existing infrastructure, real auth work

Supabase recommends Broadcast over Postgres Changes for scalability and security. Its
database-triggered variant writes into a replication-backed event table; alternatively
the application can publish through REST without opening a server WebSocket. A private
channel is necessary but still requires an RLS policy restricting its topic to the right
User. Do not copy a tutorial's policy allowing every authenticated User to every topic.
[Database changes options](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes),
[Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

Better Auth sessions are not automatically Supabase tokens. Supabase supports externally
minted JWTs through an imported signing key, passed by the client's `accessToken`
callback. A server endpoint could validate Better Auth and issue a short-lived scoped
token without migrating account authentication. Confirm issuer, audience, role, subject,
and signing configuration in a spike. If the existing IDs are text rather than UUIDs,
RLS should compare a text subject claim instead of assuming `auth.uid()` fits.
[Custom JWTs](https://supabase.com/docs/guides/auth/jwts).

First-class third-party auth additionally supports custom OIDC, but requires asymmetric
JWTs, discovery, and a key ID; Better Auth is not named as a direct integration. Key
rotation can take up to 30 minutes to propagate in this integration. This route needs
explicit verification rather than assuming an auth plugin is sufficient.
[Third-party auth](https://supabase.com/docs/guides/auth/third-party/overview).

Realtime RLS is checked at channel join and when a fresh JWT arrives, rather than for
every event. Removing a Conversation Membership does not immediately revoke a previously
authorized subscription. This matters especially for the existing proposed departure
policy. Prefer per-User invalidation events selected from current recipients, with
authoritative data fetched through the app's existing authorization. Never broadcast
future private Message bodies to a stale Conversation subscription. Expiry and forced
revocation behavior need explicit validation for Inactive Users and revoked sessions.
[Authorization and policy caching](https://supabase.com/docs/guides/realtime/authorization).

Supabase client token refresh is explicit when using custom authentication. Current
`accessToken` callback semantics refresh on connection and heartbeat; a token that expires
without replacement can close a channel. Treat refresh failures as loss of access and
clear protected client state.
[setAuth reference](https://supabase.com/docs/reference/javascript/setauth).

### Ably: managed connection lifecycle

Ably has an official Next.js guide and token-based channel capabilities, so Better Auth
can remain the authority that issues narrowly scoped real-time credentials. Browser
credentials should permit subscription only to the User's own activity channel; keep
durable Message commands server-side.
[Next.js guide](https://ably.com/docs/getting-started/nextjs),
[token authentication](https://ably.com/docs/auth/token),
[capabilities](https://ably.com/docs/auth/capabilities).

Its SDK can recover short interruptions, typically within two minutes; longer gaps or
reported loss of continuity require application reconciliation. Presence differentiates
multiple connections for the same User and is useful for online status, but does not
establish that a visible Conversation rendered a particular Message.
[Recovery](https://ably.com/docs/platform/architecture/connection-recovery),
[presence](https://ably.com/docs/presence-occupancy/presence).

Ably supports token revocation when enabled on the issuing key before tokens are issued;
the application must still reject replacement tokens for revoked sessions. This is an
available mechanism to evaluate, not a reason to skip account-lifecycle tests.
[Token revocation](https://ably.com/docs/auth/revocation).

### Upstash: practical SSE alternative

Upstash Realtime uses Redis Streams and SSE. Its Next.js route handler middleware can
validate the existing session and requested channels. The SSE route stays in this app;
Upstash supplies Redis and transport helpers rather than moving every open browser
stream off Vercel. Exact topic comparison is preferable to permissive prefix matching
from examples.
[Quickstart](https://upstash.com/docs/realtime/overall/quickstart),
[authentication middleware](https://upstash.com/docs/realtime/features/middleware).

Its documented default connection duration is 300 seconds with automatic reconnect and
replay. Redis commands are incurred for initial connections, reconnects, keepalives,
emits, and history reads. Include Vercel memory/invocation/transfer costs as well as
Redis usage; the deployment guide's CPU-only illustration is not a complete Vercel bill.
Transport replay does not make database writes and notification effects exactly once;
application event IDs, idempotency, and retention-gap reconciliation remain necessary.
[Serverless deployment](https://upstash.com/docs/realtime/features/serverless),
[command-based usage](https://upstash.com/docs/realtime/overall/pricing),
[history](https://upstash.com/docs/realtime/features/history).

Pusher Channels is another viable managed option, with private subscription
authorization. Its standard event delivery does not provide full Message history;
cache channels retain only a latest event. It therefore still needs database recovery
reads. It is not the leading recommendation here because Supabase is already documented
in the stack and Ably has a directly documented recovery model.
[Pusher authorization](https://pusher.com/docs/channels/using_channels/authorized-connections/),
[Pusher history limitations](https://docs.bird.com/pusher/channels/channels/events/does-channels-store-a-history-of-events-and-messages).

No fixed provider-price estimate is included: actual account plans, enabled features,
concurrency, and notification volume have not been inspected.

## TanStack Query and polling

TanStack Query manages fetched client data; it does not create server push. A real-time
event can invalidate the Conversation, inbox, and count queries, causing targeted reads.
That is event-driven fetching rather than interval polling. It is optional: an initial
integration can refresh the existing server-rendered views and introduce query caching
only where paginated Message updates warrant it.
[TanStack Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).

No regular browser polling is required. Reconnects, token refreshes, heartbeat packets,
and fetching current state after an event or return from sleep are still normal. A
single app-level SSE connection also avoids multiplying HTTP/1.1's low per-domain
connection ceiling across components and tabs; HTTP/2 multiplexes streams.
[Browser SSE behavior](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

## Reliability and notification policy: design implications

The following are design recommendations derived from distributed connection failures,
not claims that any provider implements the complete business policy:

- A connected socket can belong to a hidden tab, a sleeping phone, or a tab viewing a
  different Conversation. It must not automatically suppress push notifications.
- Publish activity independently of push eligibility. Otherwise Users without push
  permission would also lose live updates, and Post badge changes without notifications
  would not propagate.
- Persist Messages first. For reliable publication, persist an outbox event in the same
  transaction and process it with retries. A direct publish after commit is simpler but
  leaves a crash window. A socket transport cannot close that window.
- Use stable event IDs and existing Message idempotency semantics. Retried sends,
  duplicate events, and reconnect replay must not create duplicate Messages or toasts.
- Distinguish live transport delivery, visible UI handling, and the domain's Unread
  State. Existing Unread State means opening the Conversation, not proof that every
  Message has been viewed. Do not silently turn transport delivery into a read receipt.
- For push suppression, try live delivery immediately and accept an authenticated,
  idempotent acknowledgement tied to the notification/Message only after visible UI
  handling. A durable delayed fallback can then send push if no valid acknowledgement
  arrived. Persist the fallback and its cancellation decision; do not keep a timer only
  in a Function or rely on a presence lookup. A small race with an acknowledgement near
  dispatch can still produce a duplicate notification; optimize to avoid silent loss.
- Inside the foreground Conversation, render the Message and apply the agreed Unread
  State behavior; elsewhere in the visible app, show a toast and update badges. Decide
  separately whether a toast cancels push and whether activity on one device suppresses
  notifications to all devices.
- Shared active-view leases can use provider presence or expiring Redis keys. No SQL
  table of raw socket objects is necessary. Durable outbox and notification-delivery
  records serve a different purpose and may need tables.
- Fetch authoritative state after subscription establishment, reconnect, focus/resume,
  and any continuity gap. Coalesce bursts, ignore stale versions, and deduplicate by
  Message/event ID. Do not rely on increment/decrement counters alone.
- Test private-channel guessing, membership changes while connected, deactivation,
  session revocation, auth refresh, multiple tabs/devices, sleep/resume, missed events,
  broker failure, publish retries, and acknowledgement-versus-push races.

## Supplied articles

The first Medium article and the Easton article were accessible; the second Medium
article returned HTTP 403. They are useful introductions, but production hosting facts
above were verified against current official documentation. In particular, Vercel's
2026 native WebSocket support and extended duration beta make older hosting statements
stale. Their sample connection and event code should not replace the app's authorization,
durability, and notification policy.

- [Arnab: advanced techniques](https://arnab-k.medium.com/advanced-techniques-for-real-time-features-in-next-js-applications-aa85c19fa20e)
- [Xiouyang: production SSE guide](https://xiouyang.medium.com/building-production-ready-sse-in-next-js-a-complete-guide-18450fb74b7a)
- [Easton: WebSockets and SSE](https://eastondev.com/blog/en/posts/dev/20260107-nextjs-realtime-chat/)

## CSK Hub: verified current behavior and implementation impact

The following observations come from the checked-out repository, not from inspecting
the production deployment or provider accounts.

| Current behavior | Implication for this change | Local evidence |
| --- | --- | --- |
| Next.js 16.3.5, React 19.3, Cache Components and Partial Prefetching | Keep the server-rendered shell; add a small signed-in client connection owner | [package.json](../../package.json), [Next config](../../next.config.ts) |
| Better Auth owns sessions; database docs describe Supabase Postgres | Authenticate the application SSE endpoint with Better Auth and keep the broker independent of the database host | [Session helper](../../src/core/auth/session.server.ts), [DB infrastructure](../../src/core/db/README.md) |
| Message sends are transactional, ordered by Conversation sequence, and retry-safe | Attach durable events at the shared append boundary, covering first Direct Messages and existing Direct/Group Conversations; exact retries must not emit a second notification intent | [Sending guide](../../src/features/messaging/sending/README.md), [append operation](../../src/features/messaging/sending/append-message.ts) |
| Message sends invalidate routes for the submitting client; no subscription or push path exists | Other open browsers need an independent event connection; Message push notifications must also be added | [Send action](../../src/features/messaging/ui/conversation/actions.ts), [Messaging guide](../../src/features/messaging/README.md) |
| Conversation views render 50 Messages with older-history navigation | Live activity must not replace an older-history window, reset scrolling, or discard composer text | [Conversation query](../../src/features/messaging/ui/conversation/query.ts), [screen](../../src/features/messaging/ui/conversation/screen.tsx) |
| Read cursors use monotonic updates and a server-signed token for the returned sequence | Events must not directly advance the cursor to an unseen sequence; authorized reads should retain the token contract | [Read operation](../../src/features/messaging/ui/conversation/read.ts), [read token](../../src/features/messaging/ui/conversation/read-token.ts) |
| Inbox queries calculate per-Conversation unread counts; the app navigation currently wires only the Post badge | A global unread Message badge is additional UI/read work, alongside refreshing existing inbox counts | [Inbox query](../../src/features/messaging/ui/inbox/query.ts), [app layout](../../src/app/[locale]/(app)/layout.tsx) |
| Unread Posts are published within the last 30 days and have no read record | Publication, unpublication and personal read changes affect counts; the time horizon can also expire without a write | [Unread Post service](../../src/features/posts/unread/service.ts), [read action](../../src/features/posts/unread/actions.ts) |
| Existing Web Push delivers strings to eligible subscriptions; admin broadcasts and settings tests call it | Preserve the low-level push capability; add application notification orchestration above it, so live feedback also works for Users without push permission | [Push delivery](../../src/core/notifications/send-push-notification.ts), [broadcast actions](../../src/features/notification-broadcast/actions.ts) |
| The service worker always shows a system notification and clicking opens the app root | Conversation-aware fallback needs notification identity and an authorized app deep link, with click handling that focuses an existing client where appropriate | [Service worker](../../public/service-worker.js) |

### Suggested shared behavior

Use a single authenticated activity subscription per signed-in tab, with private
per-User events such as Conversation activity, personal unread-state changes, and
published-Post changes. Keep payloads minimal and obtain protected content through
the existing authorized application reads. Generate recipients from current authority
when dispatching, including account status and active Conversation Membership; do not
let a long-lived channel token freeze those decisions.

The event connection belongs in core/app-shell infrastructure. Messaging and Posts
should own event production, recipient rules and feature UI behavior. Core must not
import feature implementations, in accordance with the repository's
[dependency direction](../codebase-structure.md#dependency-direction). A generic
delivery capability can hide provider/auth/reconnect details without introducing
speculative adapters for every vendor.

For the existing server-rendered screens, a coalesced, event-triggered
`router.refresh()` is a reasonable first implementation. It performs a request when
something changes, rather than querying on an interval. It preserves unaffected client
state but does not invalidate server caches, so feature writes still need appropriate
invalidation. This behavior was checked against the installed
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`.
The current Message and unread reads are direct database queries, with React `cache()`
used for request deduplication where applicable. A focused TanStack Query integration
can become useful for incremental timeline pagination and targeted count updates;
introducing it is a separate choice from how events arrive.

When the current Conversation is visible, refresh or append its Messages immediately.
When viewing another screen, show a linked toast and refresh the relevant unread
counts and inbox preview. Scrolling through old history should show a new-activity
affordance without treating unrendered Messages as opened. A visible toast
acknowledgement and a Conversation read-cursor update are separate operations.
Changes to a User's read cursor must reach their other tabs/devices too, including
the implicit cursor advancement caused by sending a Message.

Post events must exclude Draft content. Re-reading the authoritative count handles
unpublish/republish semantics more safely than applying arithmetic to the badge. To
keep a long-open tab accurate at the 30-day horizon, use a one-shot expiry refresh
or a scheduled server event; database write notifications alone cannot cover time
passing. Similarly, future publication timestamps need a time-based signal if that
capability is exposed.

### Durable delivery and deployment verification

For app-published events, a transactional outbox protects against a Message committing
just before the Function fails to publish. A retrying dispatcher publishes committed
events and records per-recipient notification progress. The previously researched
Supabase database Broadcast alternative is excluded by the User's preference. A
standard broker still needs a retrying outbox publisher and does not by itself
implement a delayed Web Push fallback.

Push suppression needs durable pending delivery and an authenticated acknowledgement,
with an atomic decision when fallback becomes due. A worker or durable queue must
retry pending work after a crash. `after()` can help attempt publication promptly,
but is bounded by Function duration and does not replace this workflow; this was
checked against the installed Next.js `after.md` guide. The choice of queue/worker
and the policy for one device suppressing another device's push remain implementation
decisions, rather than implied features of the transport.

Important verification scenarios are two authenticated browser contexts receiving a
Message without interval fetches, first Direct Messages, Group Conversation changes,
live Post/unread updates, sender and reader multi-tab synchronization, preserved
composer/scroll/history state, reconnect during activity, and notification fallback
after broker or client failure. Include a crash between commit and publication, repeated
dispatch, late acknowledgement, and loss of Conversation access while connected.
Keep current signed read-token and send-idempotency invariants intact. Verify token
expiry, logout and impersonation behavior without acknowledging activity on another
User's behalf.

The hosting documentation establishes feasibility, not a tested production deployment.
Broker credentials, actual Vercel settings and broker capacity, migrations,
a durable delivery runner, and a deployed multi-client test
are needed to complete implementation. This research changed documentation only;
no runtime tests or deployment were performed.
