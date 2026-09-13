import { describe, expect, test } from "bun:test"
import { hasAdminRole, hasRole, parseRoles } from "./roles"

describe("roles", () => {
  test("parses comma-delimited and array role values consistently", () => {
    expect(parseRoles(" user, admin , , editor ")).toEqual(["user", "admin", "editor"])
    expect(parseRoles([" user ", null, "admin", 1])).toEqual(["user", "admin"])
  })

  test("does not treat absent or malformed role values as a role", () => {
    expect(parseRoles(null)).toEqual([])
    expect(hasRole({ role: "admin" }, "admin")).toBe(false)
  })

  test("recognizes admin among multiple stored roles", () => {
    expect(hasAdminRole("user, admin")).toBe(true)
    expect(hasAdminRole("user")).toBe(false)
  })
})
