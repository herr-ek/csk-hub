import { mock } from "bun:test"

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
