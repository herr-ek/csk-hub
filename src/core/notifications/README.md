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
used by the Member-facing subscription UI. `VAPID_PRIVATE_KEY` must be kept secret and
must never be exposed to a Client Component, source control, or client-side deployment
configuration. `CONTACT_EMAIL` is sent to push providers as `mailto:<CONTACT_EMAIL>`;
use an address that is monitored by the organisation.

Use the same key pair for every deployment that serves the same site, and retain it for
as long as existing device subscriptions should work. Replacing either key requires
Members to subscribe again. As a `NEXT_PUBLIC_` value, the public key is inlined at
build time, so it must be set before `next build`; rebuild and redeploy after changing
it. Browsers also require a secure context (HTTPS, with `localhost` allowed for local
development), service-worker support, and the Member's permission to display
notifications.

Member subscription setup belongs in account settings. Features that only send notifications should not register service workers or write `push_subscription` rows directly.

## Sending a notification

Import the smallest delivery operation that matches the feature's audience:

```ts
import { sendToAll, sendToUser, sendToUsers } from "@/core/notifications"

const oneMember = await sendToUser(memberId, "Rehearsal starts in 30 minutes.")
const selectedMembers = await sendToUsers(memberIds, "The venue has changed.")
const everyone = await sendToAll("The event calendar has been updated.")
```

Call these only from server-side feature code, after the feature has authorized the actor and validated its input. For example, an Admin-only write action should call `requireAdmin()` before delivery.

```ts
"use server"

import { requireAdmin } from "@/core/auth/permissions.server"
import { sendToUsers } from "@/core/notifications"

export async function notifySelectedMembers(memberIds: string[], message: string) {
  await requireAdmin()
  const text = message.trim()
  if (!text) return { success: false as const, error: "Enter a notification message first." }

  return sendToUsers(memberIds, text)
}
```

## Delivery result

All send functions resolve to one of these shapes:

```ts
{ success: true }
{ success: false, error: string }
```

`success: false` means there were no active subscriptions or every attempted delivery failed. A successful result means at least one active subscription accepted the notification; it does not guarantee every selected device received it. Features should show the returned error to the actor and reserve exceptions for unexpected infrastructure failures.

When a provider returns HTTP 404 or 410, this module marks that subscription disabled so future sends skip it. It also tracks delivery timestamps and failure counts. Features must not mutate those lifecycle fields directly.

## Finding subscribed Members

`listUsersWithActiveSubscriptions(search)` returns up to 25 Better Auth records with active subscriptions, filtered by name or email. It is intended for an authorized recipient picker. Keep its result inside server-authorized feature flows; it exposes Member names and email addresses.
