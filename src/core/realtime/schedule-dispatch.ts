import "server-only"

import { after } from "next/server"
import { env } from "@/core/config/env"
import { deliverPendingActivity } from "./deliver-pending"
import type { ActivityDeliveryPolicy } from "./delivery-access"

/** Call after a feature transaction commits. Attempts delivery after the response, within its time budget. */
export function scheduleActivityDispatch(policy: ActivityDeliveryPolicy) {
  if (!env.REDIS_URL) return
  after(() => deliverPendingActivity(policy))
}
