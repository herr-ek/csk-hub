"use server"

import { getRequestSession } from "@/core/auth/session.server"
import { unsubscribe } from "@/core/notifications"

/** Removes this browser's push binding before an ordinary User signs out. */
export async function revokePushBindingBeforeLogout(endpoint: string) {
  const session = await getRequestSession()
  if (!session) throw new Error("Unauthorized")
  if (session.session.impersonatedBy) return false
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 4096) {
    throw new Error("Invalid push endpoint")
  }

  return unsubscribe(session.user.id, endpoint)
}
