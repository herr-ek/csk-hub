"use server"

import { getRequestSession } from "@/core/auth/session.server"
import { unsubscribe } from "@/core/notifications"

/**
 * Removes only the signed-in User's binding for this endpoint. Returns false
 * when no owned binding exists. Throws `Unauthorized`
 * without a session and `InvalidNotificationSubscriptionError` for invalid endpoints.
 */
export async function revokePushBindingBeforeLogout(endpoint: string) {
  const session = await getRequestSession()
  if (!session) throw new Error("Unauthorized")

  return unsubscribe(session.user.id, endpoint)
}
