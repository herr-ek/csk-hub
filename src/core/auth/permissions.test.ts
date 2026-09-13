import { describe, expect, test } from "bun:test"
import { ADMIN_ROLE, accessRoles, adminPluginOptions, DEFAULT_ROLE, USER_ROLE } from "./permissions"

describe("auth roles", () => {
  test("uses Better Auth's default user role", () => {
    expect(DEFAULT_ROLE).toBe("user")
    expect(adminPluginOptions).not.toHaveProperty("defaultRole")
  })
})

describe("post permissions", () => {
  test("an Admin may publish a Post", () => {
    expect(accessRoles[ADMIN_ROLE].authorize({ post: ["create"] }).success).toBe(true)
  })

  test("a User reads the news feed but does not publish to it", () => {
    expect(accessRoles[USER_ROLE].authorize({ post: ["read"] }).success).toBe(true)
    expect(accessRoles[USER_ROLE].authorize({ post: ["create"] }).success).toBe(false)
  })

  test("keeps the admin plugin's own grants", () => {
    expect(accessRoles[ADMIN_ROLE].authorize({ user: ["ban"] }).success).toBe(true)
    expect(accessRoles[USER_ROLE].authorize({ user: ["ban"] }).success).toBe(false)
  })
})
