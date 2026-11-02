import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/core/db"
import { activityDelivery } from "@/core/db/schema/activity"
import { getActivitySession } from "./access"
import { type ActivityDeliveryPolicy, isDeliveryAllowed } from "./delivery-access"

/** A foreground toast acknowledgement cancels push, without marking the Conversation read. */
export async function handleActivityAcknowledgement(policy: ActivityDeliveryPolicy, request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 })
  const identity = await getActivitySession()
  if (!identity) return new Response(null, { status: 401 })
  const input = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null))
  if (!input.success) return new Response(null, { status: 400 })
  const [delivery] = await db
    .select()
    .from(activityDelivery)
    .where(and(eq(activityDelivery.id, input.data.id), eq(activityDelivery.userId, identity.userId)))
  if (!delivery || !(await isDeliveryAllowed(policy, delivery))) return new Response(null, { status: 404 })
  await db
    .update(activityDelivery)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(activityDelivery.id, delivery.id),
        eq(activityDelivery.userId, identity.userId),
        isNull(activityDelivery.acknowledgedAt)
      )
    )
  return new Response(null, { status: 204 })
}
