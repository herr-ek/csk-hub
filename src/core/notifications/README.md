# Push notifications

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

The browser's PushManager subscription is separate from the current User's server-side binding. Settings must confirm that the endpoint has an active row for the signed-in User before showing notifications as enabled. If a browser subscription exists without that binding, an explicit reconnect action rebinds it to the current User; never return or display the previous owner's identity. Ordinary logout removes that browser endpoint's binding before signing out. Stopping impersonation leaves the Admin's browser binding untouched, and subscription actions are unavailable during impersonation.

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

All send functions resolve to one of these shapes:

```ts
{ success: true, accepted: number, failed: number, failureCategories: Record<string, number> }
{ success: false, error: "noActiveSubscriptions" | "noRecipients" | "deliveryFailed", accepted: 0, failed: number, failureCategories: Record<string, number> }
```

`accepted` counts subscriptions whose push provider accepted the notification. `failed` counts subscriptions that did not accept it. A successful result means at least one active subscription accepted the notification; it does not guarantee every selected device received it. `failureCategories` contains only sanitized counts such as `timeout`, `providerRejected`, or `bookkeeping`; it never includes endpoints, keys, or message text. Features show accepted/attempted counts and handle the returned error code. Notifications use the application name, `CSK Hub`, as a fixed title and preserve the supplied message as their body.

When a provider returns HTTP 404 or 410, this module marks that subscription disabled so future sends skip it. It also tracks delivery timestamps and failure counts. Features must not mutate those lifecycle fields directly.

Provider sends use bounded concurrency, a 7-second socket inactivity timeout, a 10-second request socket deadline, and a 30-second batch deadline. Lifecycle bookkeeping is best effort and bounded to 2 seconds per update. Provider acceptance is recorded independently: if an accepted send cannot update its database metadata, the result still counts it as accepted, records a sanitized `bookkeeping` diagnostic, and does not trigger an automatic resend.

## Finding subscribed Users

`listUsersWithActiveSubscriptions(search)` returns up to 25 Better Auth records with active subscriptions, filtered by name or email. It is intended for an authorized recipient picker. Keep its result inside server-authorized feature flows; it exposes User names and email addresses.
