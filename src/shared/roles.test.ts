import { describe, expect, test } from "bun:test"
import { hasAdminRole, hasRole, parseRoles } from "./roles"

describe("roles", () => {
  test("parses comma-delimited and array role values consistently", () => {
    expect(parseRoles(" member, admin , , editor ")).toEqual(["member", "admin", "editor"])
    expect(parseRoles([" member ", null, "admin", 1])).toEqual(["member", "admin"])
  })

  test("does not treat absent or malformed role values as a role", () => {
    expect(parseRoles(null)).toEqual([])
    expect(hasRole({ role: "admin" }, "admin")).toBe(false)
  })

  test("recognizes admin among multiple stored roles", () => {
    expect(hasAdminRole("member, admin")).toBe(true)
    expect(hasAdminRole("member")).toBe(false)
  })
})
