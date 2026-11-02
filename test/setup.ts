import { mock } from "bun:test"

// Keep ordinary unit/DB tests independent of a developer's live-delivery configuration.
// The process-isolated activity integration suite opts in and supplies its own broker prefix.
if (!process.env.CSK_ACTIVITY_TEST) {
  delete process.env.REDIS_URL
}

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      origin: "http://localhost:3000"
    }
  },
  configurable: true
})

// Server modules guard themselves with `server-only`, which throws outside a server
// runtime. The guard protects the bundler, not the tests.
mock.module("server-only", () => ({}))

mock.module("@/core/logging", () => ({
  logger: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock()
  }
}))
