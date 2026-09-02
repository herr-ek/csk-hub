import { mock } from "bun:test"

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      origin: "http://localhost:3000"
    }
  },
  configurable: true
})

mock.module("@/core/logging", () => ({
  logger: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock()
  }
}))
