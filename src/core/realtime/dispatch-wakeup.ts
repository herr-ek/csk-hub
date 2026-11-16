import "server-only"

import { setTimeout as sleep } from "node:timers/promises"

/** Wakes a waiting dispatcher without losing signals that arrive before it starts waiting. */
export class DispatchWakeup {
  revision = 0
  private changed = Promise.withResolvers<void>()

  wake() {
    this.revision++
    this.changed.resolve()
    this.changed = Promise.withResolvers<void>()
  }

  async wait(delay: number, signal: AbortSignal, observed: number) {
    if (this.revision !== observed || signal.aborted) return
    const cancel = new AbortController()
    try {
      await Promise.race([
        this.changed.promise,
        sleep(delay, undefined, { signal: AbortSignal.any([signal, cancel.signal]) })
      ]).catch(() => {})
    } finally {
      cancel.abort()
    }
  }
}
