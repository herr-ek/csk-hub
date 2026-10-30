import "server-only"

import { and, eq, gt, isNull, or } from "drizzle-orm"
import { getRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { session, user } from "@/core/db/schema/auth"

export { isDeliveryAllowed } from "./delivery-access"
export type ActivitySession = { userId: string; sessionId: string }

/** The database check bypasses the cookie cache for long-lived streams and acknowledgements. */
export async function isActivitySessionActive(identity: ActivitySession) {
  const [active] = await db
    .select({ id: session.id })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(
      and(
        eq(session.id, identity.sessionId),
        eq(session.userId, identity.userId),
        gt(session.expiresAt, new Date()),
        isNull(session.impersonatedBy),
        or(eq(user.banned, false), isNull(user.banned))
      )
    )
  return Boolean(active)
}

export async function getActivitySession(): Promise<ActivitySession | null> {
  const current = await getRequestSession()
  if (!current || current.session.impersonatedBy) return null
  const identity = { userId: current.user.id, sessionId: current.session.id }
  return (await isActivitySessionActive(identity)) ? identity : null
}
