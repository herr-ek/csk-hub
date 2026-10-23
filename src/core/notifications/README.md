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

## Sending a notification

Import the smallest delivery operation that matches the feature's audience:

```ts
import { sendToAll, sendToUser, sendToUsers } from "@/core/notifications"

const oneUser = await sendToUser(userId, { body: "Rehearsal starts in 30 minutes." })
const selectedUsers = await sendToUsers(userIds, { body: "The venue has changed.", url: "/events/42" })
const everyone = await sendToAll({ body: "The event calendar has been updated.", tag: "events:calendar" })
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

  return sendToUsers(userIds, { body: text })
}
```

## Delivery result

All send functions resolve to one of these shapes:

```ts
{ success: true }
{ success: false, error: "noActiveSubscriptions" | "noRecipients" | "deliveryFailed" }
```

`success: false` means there were no active subscriptions or every attempted delivery failed. A successful result means at least one active subscription accepted the notification; it does not guarantee every selected device received it. Features handle the returned error code and reserve exceptions for unexpected infrastructure failures. Notifications use the application name, `CSK Hub`, as a fixed title and preserve the supplied `body`.

A notification may carry a `url`: a same-origin path, such as `/news/<id>`, that clicking it opens, focusing an open app window when there is one. Any other value throws before delivery. A `tag`, conventionally `<feature>:<id>`, makes a newer notification replace an older one with the same tag instead of stacking.

## Adding notifications to a feature

A feature that notifies Users on its own events, such as a published Post or a new Message, calls the send functions from its server-side write path. Keep these rules:

- The feature decides who is notified and authorizes the actor; this module only delivers.
- Send after the write has committed, inside `after()` from `next/server`, so slow or failed delivery never delays or fails the User's action.
- Send only when the write created something. An idempotent retry, such as `appendMessage` returning `created: false`, must not notify twice.
- Write the text in each recipient's Language (ADR-0004): group recipients by their locale and send each group its own body.
- Set `url` to the item's permalink and `tag` to `<feature>:<id>`.
- Whether inactive Users are excluded is still open in #99; follow its decision once made.

Notifying on events the product has said are silent, such as publishing a Post, is a product decision first: record it in an ADR before wiring it in.

When a provider returns HTTP 404 or 410, this module marks that subscription disabled so future sends skip it. It also tracks delivery timestamps and failure counts. Features must not mutate those lifecycle fields directly.

## Finding subscribed Users

`listUsersWithActiveSubscriptions(search)` returns up to 25 Better Auth records with active subscriptions, filtered by name or email. It is intended for an authorized recipient picker. Keep its result inside server-authorized feature flows; it exposes User names and email addresses.
