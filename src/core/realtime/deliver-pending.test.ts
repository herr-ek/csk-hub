import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { ActivityDeliveryPolicy } from "./delivery-access"

if (!process.env.CSK_DISPATCH_TEST) {
  test("bounded after-response activity delivery", async () => {
    const child = Bun.spawn([process.execPath, "test", "--isolate", import.meta.path], {
      env: { ...process.env, CSK_DISPATCH_TEST: "1" },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (code !== 0) throw new Error(`${stdout}\n${stderr}`)
  })
} else {
  const env = { REDIS_URL: "redis://localhost:6379" }
  mock.module("@/core/config/env", () => ({ env }))
  const policy: ActivityDeliveryPolicy = { canDeliver: async () => true, isAlreadyOpened: async () => false }
  const dispatch = mock(async (_policy: ActivityDeliveryPolicy, _signal?: AbortSignal) => ({ processed: 1 }))
  const nextDelay = mock(async (): Promise<number | null> => null)
  const prune = mock(async () => {})
  mock.module("./dispatch", () => ({ dispatchActivity: dispatch, nextActivityDelay: nextDelay, pruneActivity: prune }))
  const sleep = mock(async (_delay: number, _value?: unknown, _options?: { signal: AbortSignal }) => {})
  mock.module("node:timers/promises", () => ({ setTimeout: sleep }))
  const callbacks: Array<() => Promise<void>> = []
  mock.module("next/server", () => ({ after: (callback: () => Promise<void>) => callbacks.push(callback) }))
  const { deliverPendingActivity } = await import("./deliver-pending")
  const { scheduleActivityDispatch } = await import("./schedule-dispatch")

  beforeEach(() => {
    env.REDIS_URL = "redis://localhost:6379"
    callbacks.length = 0
    dispatch.mockReset().mockResolvedValue({ processed: 1 })
    nextDelay.mockReset().mockResolvedValue(null)
    sleep.mockReset().mockResolvedValue(undefined)
  })

  describe("after-response delivery", () => {
    test("scheduling does no delivery until the response callback runs", async () => {
      scheduleActivityDispatch(policy)
      expect(dispatch).not.toHaveBeenCalled()
      expect(callbacks).toHaveLength(1)
      await callbacks[0]()
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(dispatch.mock.calls[0][0]).toBe(policy)
      expect(sleep).not.toHaveBeenCalled()
    })

    test("disabled realtime schedules no work", () => {
      env.REDIS_URL = ""
      scheduleActivityDispatch(policy)
      expect(callbacks).toHaveLength(0)
    })

    test("waits for a pending push deadline before attempting delivery again", async () => {
      nextDelay.mockResolvedValueOnce(8_000)
      await deliverPendingActivity(policy)
      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(sleep.mock.calls[0][0]).toBe(8_000)
    })

    test("transient database failure retries within the same response callback", async () => {
      dispatch.mockRejectedValueOnce(new Error("Database unavailable"))
      await deliverPendingActivity(policy)
      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(sleep.mock.calls[0][0]).toBe(1_000)
    })

    test("an expired budget stops waiting and leaves pending delivery for a later request", async () => {
      const stop = new AbortController()
      nextDelay.mockResolvedValue(90_000)
      sleep.mockImplementationOnce(async (_delay, _value, options) => {
        expect(options?.signal).toBe(stop.signal)
        stop.abort()
        throw new Error("Aborted")
      })
      await deliverPendingActivity(policy, stop.signal)
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(sleep).toHaveBeenCalledTimes(1)
    })

    test("a task whose budget already expired does not claim anything", async () => {
      await deliverPendingActivity(policy, AbortSignal.abort())
      expect(dispatch).not.toHaveBeenCalled()
    })
  })
}
