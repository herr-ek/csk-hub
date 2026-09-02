import { describe, expect, test } from "bun:test"
import { createApplicationLogger } from "./logger"

describe("application logger", () => {
  test("writes structured JSON entries", () => {
    const entries: string[] = []
    const logger = createApplicationLogger({
      write: (entry) => entries.push(entry),
      now: () => new Date("2026-07-21T12:00:00.000Z")
    })

    logger.info("audit.example", { actorUserId: "user-1" })

    expect(JSON.parse(entries[0])).toEqual({
      timestamp: "2026-07-21T12:00:00.000Z",
      level: "info",
      event: "audit.example",
      context: { actorUserId: "user-1" }
    })
  })

  test("does not throw when the log sink fails", () => {
    const logger = createApplicationLogger({
      write: () => {
        throw new Error("sink unavailable")
      }
    })

    expect(() => logger.error("application.failure")).not.toThrow()
  })

  test("writes audit events through the normal log sink", () => {
    const entries: string[] = []
    const logger = createApplicationLogger({ write: (entry) => entries.push(entry) })

    logger.audit("auth.impersonation.started", { adminUserId: "admin-1", memberUserId: "member-1" })

    expect(JSON.parse(entries[0])).toMatchObject({
      level: "audit",
      event: "auth.impersonation.started",
      context: { adminUserId: "admin-1", memberUserId: "member-1" }
    })
  })
})
