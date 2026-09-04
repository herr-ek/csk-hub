import { describe, expect, test } from "bun:test"
import { canPublishPost } from "./permissions"

describe("canPublishPost", () => {
  test("lets an Admin publish", () => {
    expect(canPublishPost({ role: "admin" })).toBe(true)
    expect(canPublishPost({ role: "member,admin" })).toBe(true)
  })

  test("refuses a Member who is not an Admin", () => {
    expect(canPublishPost({ role: "member" })).toBe(false)
    expect(canPublishPost({ role: null })).toBe(false)
    expect(canPublishPost({})).toBe(false)
  })

  test("refuses an unknown actor", () => {
    expect(canPublishPost(null)).toBe(false)
    expect(canPublishPost(undefined)).toBe(false)
  })
})
