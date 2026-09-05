# Push notifications

`@/core/notifications` is the server-only capability for storing web-push subscriptions and delivering a push message. Feature modules own their own authorization, recipient selection, and UI; this module owns the subscription records and the web-push provider interaction.

## Prerequisites

The application requires both VAPID environment variables:

```dotenv
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

The public key is used by the Member-facing subscription UI. Never expose `VAPID_PRIVATE_KEY` to a Client Component.

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
