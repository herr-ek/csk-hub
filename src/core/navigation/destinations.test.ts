import { describe, expect, test } from "bun:test"
import { MENUS, visibleDestinations } from "./destinations"

const member = { showAdmin: false }
const admin = { showAdmin: true }

describe("visible destinations", () => {
  test("members see the sections without Admin", () => {
    expect(visibleDestinations(MENUS.topBar, member)).toEqual(["events", "news", "messages", "members"])
    expect(visibleDestinations(MENUS.sheet, member)).toEqual(["news", "events", "messages", "members"])
  })

  test("those with admin access see Admin last", () => {
    expect(visibleDestinations(MENUS.topBar, admin)).toEqual(["events", "news", "messages", "members", "admin"])
    expect(visibleDestinations(MENUS.sheet, admin)).toEqual(["news", "events", "messages", "members", "admin"])
  })

  test("signed-out visitors only see the login link", () => {
    expect(visibleDestinations(MENUS.topBar, null)).toEqual(["login"])
    expect(visibleDestinations(MENUS.sheet, null)).toEqual([])
  })

  test("the quick-access bar is the same for every member", () => {
    const slots = ["events", "news", "home", "messages", "account"] as const
    expect(visibleDestinations(MENUS.quickAccess, member)).toEqual([...slots])
    expect(visibleDestinations(MENUS.quickAccess, admin)).toEqual([...slots])
    expect(visibleDestinations(MENUS.quickAccess, null)).toEqual([])
  })
})
