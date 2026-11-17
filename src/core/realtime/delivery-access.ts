import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/core/db"
import type { activityDelivery } from "@/core/db/schema/activity"
import { user } from "@/core/db/schema/auth"

export type Delivery = typeof activityDelivery.$inferSelect

/**
 * Feature checks supplied by app composition, never registered in mutable global state.
 * canDeliver must recheck current access; isAlreadyOpened consults authoritative read
 * state to suppress push. Both are required so callers cannot silently bypass a check.
 */
export type ActivityDeliveryPolicy = {
  canDeliver: (delivery: Delivery) => Promise<boolean>
  isAlreadyOpened: (delivery: Delivery) => Promise<boolean>
}

/** Rechecks the recipient's account and feature-specific access before exposing activity. */
export async function isDeliveryAllowed(policy: ActivityDeliveryPolicy, delivery: Delivery) {
  const [recipient] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, delivery.userId))
  return Boolean(recipient && !recipient.banned && (await policy.canDeliver(delivery)))
}
