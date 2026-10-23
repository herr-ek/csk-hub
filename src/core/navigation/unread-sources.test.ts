import { describe, expect, test } from "bun:test"
import { getUnreadSource, listUnreadSources, registerUnreadSource } from "./unread-sources"

describe("unread sources", () => {
  test("a destination nobody subscribed to has no count", () => {
    expect(getUnreadSource("members")).toBeUndefined()
  })

  test("registering a destination again replaces its count", async () => {
    registerUnreadSource("admin", async () => 1)
    registerUnreadSource("admin", async () => 2)

    expect(await getUnreadSource("admin")?.("user-1")).toBe(2)
    expect(listUnreadSources().filter((count) => count === getUnreadSource("admin"))).toHaveLength(1)
  })
})
