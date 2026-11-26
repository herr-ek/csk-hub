import { describe, expect, test } from "bun:test"
import { MENUS, visibleDestinations } from "./destinations"

const user = { showAdmin: false }
const admin = { showAdmin: true }

describe("visible destinations", () => {
  test("Users see the sections without Admin", () => {
    expect(visibleDestinations(MENUS.topBar, user)).toEqual(["events", "news", "messages", "members"])
    expect(visibleDestinations(MENUS.sheet, user)).toEqual(["news", "events", "messages", "members"])
  })

  test("those with admin access see Admin last", () => {
    expect(visibleDestinations(MENUS.topBar, admin)).toEqual(["events", "news", "messages", "members", "admin"])
    expect(visibleDestinations(MENUS.sheet, admin)).toEqual(["news", "events", "messages", "members", "admin"])
  })

  test("signed-out visitors only see the login link", () => {
    expect(visibleDestinations(MENUS.topBar, null)).toEqual(["login"])
    expect(visibleDestinations(MENUS.sheet, null)).toEqual([])
  })

  test("the quick-access bar, shown to every User alike, keeps all its slots", () => {
    expect(visibleDestinations(MENUS.quickAccess, user)).toEqual(["events", "news", "home", "messages", "account"])
  })
})
