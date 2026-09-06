import { describe, expect, test } from "bun:test"
import { ADMIN_ROLE, accessRoles, MEMBER_ROLE } from "./permissions"

describe("post permissions", () => {
  test("an Admin may publish a Post", () => {
    expect(accessRoles[ADMIN_ROLE].authorize({ post: ["create"] }).success).toBe(true)
  })

  test("a Member reads the news feed but does not publish to it", () => {
    expect(accessRoles[MEMBER_ROLE].authorize({ post: ["read"] }).success).toBe(true)
    expect(accessRoles[MEMBER_ROLE].authorize({ post: ["create"] }).success).toBe(false)
  })

  test("keeps the admin plugin's own grants", () => {
    expect(accessRoles[ADMIN_ROLE].authorize({ user: ["ban"] }).success).toBe(true)
    expect(accessRoles[MEMBER_ROLE].authorize({ user: ["ban"] }).success).toBe(false)
  })
})
