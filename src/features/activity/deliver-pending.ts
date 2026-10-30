import "server-only"

import { setTimeout as sleep } from "node:timers/promises"
import { env } from "@/core/config/env"
import { logger } from "@/core/logging"
import { getErrorCode, getErrorName } from "@/shared/errors"
import { dispatchActivity, nextActivityDelay, pruneActivity } from "./dispatch"

let maintenanceAt = 0

/**
 * Attempts pending delivery for up to 30 seconds, including the push grace period and
 * retries. Stops claiming on abort and finishes the current delivery. Pending work stays
 * in Postgres for a later invocation; there is no independent recovery while idle.
 */
export async function deliverPendingActivity(signal = AbortSignal.timeout(30_000)) {
  if (!env.REDIS_URL || signal.aborted) return
  // Opportunistic retention, at most hourly per instance; delivery must survive cleanup failure.
  if (Date.now() >= maintenanceAt) {
    maintenanceAt = Date.now() + 3_600_000
    await pruneActivity().catch(() => logger.warn("realtime.retention.failed"))
  }
  let failures = 0
  while (!signal.aborted) {
    let delay: number
    try {
      const { processed } = await dispatchActivity(signal)
      if (processed) logger.info("realtime.dispatch.batch", { processed })
      if (signal.aborted) break
      const nextDue = await nextActivityDelay()
      if (nextDue === null) return
      delay = Math.max(25, nextDue)
      failures = 0
    } catch (error) {
      if (signal.aborted) break
      failures++
      delay = Math.min(8_000, 1_000 * 2 ** (failures - 1))
      logger.warn("realtime.dispatch.retry", {
        retryMs: delay,
        errorCode: getErrorCode(error),
        errorName: getErrorName(error)
      })
    }
    await sleep(delay, undefined, { signal }).catch(() => {})
  }
  logger.warn("realtime.dispatch.interrupted")
}
