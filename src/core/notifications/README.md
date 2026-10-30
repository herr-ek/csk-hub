# Push notifications

Application Messages and Admin broadcasts use the shared
[live-delivery workflow](../realtime/README.md) when Redis is configured: visible feedback
is attempted first, followed by durable Web Push fallback. The functions below remain
the immediate, low-level Web Push capability; settings delivery tests deliberately use
them to verify push even when the app is open. A successful low-level result means
provider acceptance, while the broadcast UI separately reports queued recipients.

`@/core/notifications` is the server-only capability for storing web-push subscriptions and delivering a push message. Feature modules own their own authorization, recipient selection, and UI; this module owns the subscription records and the web-push provider interaction.

## Prerequisites

Web push requires a VAPID key pair and a contact email address. Generate the pair once,
then store it in the environment used to build and run the application:

```sh
bunx web-push generate-vapid-keys
```

Set the generated values and a maintained contact address:

```dotenv
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<matching generated private key>
CONTACT_EMAIL=webmaster@example.org
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is deliberately included in the browser bundle and is
used by the User-facing subscription UI. `VAPID_PRIVATE_KEY` must be kept secret and
must never be exposed to a Client Component, source control, or client-side deployment
configuration. `CONTACT_EMAIL` is sent to push providers as `mailto:<CONTACT_EMAIL>`;
use an address that is monitored by the organisation.

Use the same key pair for every deployment that serves the same site, and retain it for
as long as existing device subscriptions should work. Replacing either key requires
Users to subscribe again. As a `NEXT_PUBLIC_` value, the public key is inlined at
build time, so it must be set before `next build`; rebuild and redeploy after changing
it. Browsers also require a secure context (HTTPS, with `localhost` allowed for local
development), service-worker support, and the User's permission to display
notifications.

User subscription setup belongs in account settings. Features that only send notifications should not register service workers or write `push_subscription` rows directly.

The browser's PushManager subscription is separate from the current User's server-side binding. Settings must confirm that the endpoint has an active row for the signed-in User before showing notifications as enabled. If a browser subscription exists without that binding, an explicit reconnect action rebinds it to the current User; never return or display the previous owner's identity. Ordinary logout attempts to remove that browser endpoint's binding before signing out. Push discovery or revocation errors never prevent sign-out: if server revocation fails after browser discovery, browser unsubscribe is attempted as a fallback. If both fail, the binding may remain active; logout does not guarantee push revocation. A confirmed binding owned by someone else is left untouched. Stopping impersonation leaves the Admin's browser binding untouched, and subscription actions are unavailable during impersonation.

## Endpoint validation and recovery

Logout waits at most two seconds for push cleanup before starting sign-out. After
that deadline, late cleanup results cannot start further browser cleanup operations;
requests already in flight may still complete.

Subscriptions are runtime-validated before registration, rebinding, and delivery.
Public encryption keys must encode a valid uncompressed P-256 point.
Supported provider hosts are `fcm.googleapis.com`, `push.services.mozilla.com`,
`push.apple.com`, and `notify.windows.com` (including subdomains for the latter
three). HTTPS is required; credentials, fragments, nondefault ports, and hosts
outside this list are rejected. Channel paths and tokens are opaque to the app;
the provider validates them. This includes WNS root-path URLs.

Edge on Windows uses WNS ([Microsoft's policy documentation](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/forcebuiltinpushmessagingclient)).
WNS channel URLs may contain a token at the root path ([WNS URL guidance](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview)).

Settings distinguishes a confirmed binding, an absent binding, an unsupported
endpoint, and a failed lookup. Unsupported endpoints offer explicit browser
removal. Failed lookups remain unknown and offer retry and browser removal;
network errors never imply that ownership was checked. Focus refreshes recheck
ownership and reuse the service-worker registration, registering only if missing.
Already-granted permission does not trigger another permission request.

This change requires no schema migration, but it changes stored-row lifecycle:
invalid stored subscriptions are disabled on the next delivery attempt. Expanding
the supported provider list does not automatically reactivate previously disabled
rows; an explicit reconnect revalidates and reactivates a supported subscription.

Only active Users (`banned` false or null) are eligible for delivery and the
recipient picker. Eligibility is checked when recipients are selected; already
selected or provider-accepted notifications cannot be recalled. Deactivation
leaves device health unchanged, so reactivation restores delivery to existing
active bindings without reviving disabled ones.

## Sending a notification

Import the smallest delivery operation that matches the feature's audience:

```ts
import { sendToAll, sendToUser, sendToUsers } from "@/core/notifications"

const oneUser = await sendToUser(userId, "Rehearsal starts in 30 minutes.")
const selectedUsers = await sendToUsers(userIds, "The venue has changed.")
const everyone = await sendToAll("The event calendar has been updated.")
```

Call these only from server-side feature code, after the feature has authorized the actor and validated its input. For example, an Admin-only write action should call `requireAdmin()` before delivery.

```ts
"use server"

import { requireAdmin } from "@/core/auth/permissions.server"
import { sendToUsers } from "@/core/notifications"

export async function notifySelectedUsers(userIds: string[], message: string) {
  await requireAdmin()
  const text = message.trim()
  if (!text) return { success: false as const, error: "messageRequired" as const }

  return sendToUsers(userIds, text)
}
```

## Delivery result

All send functions resolve to `NotificationDeliveryResult`. The shared diagnostics
use the closed failure-category union from `types.ts`:

```ts
import type { NotificationDeliveryFailureCategory, NotificationDeliveryResult } from "./types"

type Diagnostics = {
  accepted: number
  failed: number
  failureCategories: Partial<Record<NotificationDeliveryFailureCategory, number>>
}

// NotificationDeliveryResult combines Diagnostics with either:
// { success: true }
// { success: false, error: "noActiveSubscriptions" | "noRecipients" | "deliveryFailed" }
```

`accepted` counts subscriptions whose push provider accepted the notification. `failed` counts subscriptions that did not accept it. A successful result means at least one active subscription accepted the notification; it does not guarantee every selected device received it. `failureCategories` contains only sanitized counts such as `timeout`, `providerRejected`, or `bookkeeping`; it never includes endpoints, keys, or message text. Features show accepted/attempted counts and handle the returned error code. Notifications use the application name, `CSK Hub`, as a fixed title and preserve the supplied message as their body.

When a provider returns HTTP 404 or 410, or stored subscription data fails validation, this module marks that subscription disabled so future sends skip it. It also tracks delivery timestamps and atomically increments failure counts in SQL, avoiding lost increments from concurrent sends. Sanitized failure counts are logged without endpoint, key, or message contents. Features must not mutate those lifecycle fields directly.

Provider sends use concurrency capped at five, a 7-second socket inactivity timeout,
and a 10-second overall deadline per send. Each attempt uses its own HTTPS agent;
deadline expiry closes its sockets. Every selected subscription is attempted—there
is no batch cutoff that skips recipients. Total delivery time grows with the number
of subscriptions, roughly 12 seconds per group of five at worst, excluding the
initial database query and scheduling overhead.

Lifecycle bookkeeping is best effort, with a 2-second wait limit per update.
Provider acceptance remains acceptance even if that write fails or times out;
a sanitized `bookkeeping` diagnostic records the problem without triggering a resend.

## Finding subscribed Users

`listUsersWithActiveSubscriptions(search)` returns up to 25 Better Auth records with active subscriptions, filtered by name or email. It is intended for an authorized recipient picker. Keep its result inside server-authorized feature flows; it exposes User names and email addresses.
