import "server-only"

import { after } from "next/server"
import { env } from "@/core/config/env"
import { deliverPendingActivity } from "./deliver-pending"

/** Call after a feature transaction commits. Attempts delivery after the response, within its time budget. */
export function scheduleActivityDispatch() {
  if (!env.REDIS_URL) return
  after(() => deliverPendingActivity())
}
