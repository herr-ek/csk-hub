import "server-only"

import { after } from "next/server"
import { env } from "@/core/config/env"
import { deliverPendingActivity } from "./deliver-pending"
import type { ActivityDeliveryPolicy } from "./delivery-access"
import { DispatchWakeup } from "./dispatch-wakeup"

const running = new Map<
  ActivityDeliveryPolicy,
  { wakeup: DispatchWakeup; signal: AbortSignal; promise: Promise<void> }
>()

function runDispatch(policy: ActivityDeliveryPolicy): Promise<void> {
  const active = running.get(policy)
  if (active) {
    active.wakeup.wake()
    // Finish the expired wave before a newer request starts its own processing window.
    if (active.signal.aborted) return active.promise.then(() => runDispatch(policy))
    return active.promise
  }
  const wakeup = new DispatchWakeup()
  const signal = AbortSignal.timeout(30_000)
  const promise = deliverPendingActivity(policy, signal, wakeup).finally(() => running.delete(policy))
  running.set(policy, { wakeup, signal, promise })
  return promise
}

/** Call after a relevant write commits. Requests share one bounded loop per policy and wake it for new work. */
export function scheduleActivityDispatch(policy: ActivityDeliveryPolicy) {
  if (!env.REDIS_URL) return
  running.get(policy)?.wakeup.wake()
  // Each request keeps the shared work alive through its own after() callback.
  after(() => runDispatch(policy))
}
