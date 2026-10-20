import { describe, expect, test } from "bun:test"
import { ADMIN_ROLE, accessRoles, adminPluginOptions, DEFAULT_ROLE, USER_ROLE } from "./permissions"

describe("auth roles", () => {
  test("uses Better Auth's default user role", () => {
    expect(DEFAULT_ROLE).toBe("user")
    expect(adminPluginOptions).not.toHaveProperty("defaultRole")
  })
  test("keeps the admin plugin's own grants", () => {
    expect(accessRoles[ADMIN_ROLE].authorize({ user: ["ban"] }).success).toBe(true)
    expect(accessRoles[USER_ROLE].authorize({ user: ["ban"] }).success).toBe(false)
  })
})
