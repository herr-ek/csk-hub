import { describe, expect, test } from "bun:test"
import { userPreferencesDefaults, userPreferencesSchema, userPreferencesUpdateSchema } from "./schema"

describe("user preferences validation", () => {
  test("returns a complete preference object from stored values", () => {
    expect(userPreferencesSchema.parse({ locale: "en", quickAccessEnabled: false, quickAccess: ["messages"] })).toEqual(
      {
        locale: "en",
        quickAccessEnabled: false,
        quickAccess: ["messages"]
      }
    )
  })

  test("uses defaults for missing rows and fields", () => {
    expect(userPreferencesDefaults).toEqual({
      locale: null,
      quickAccessEnabled: true,
      quickAccess: ["news", "messages"]
    })
    expect(userPreferencesSchema.parse(undefined)).toEqual(userPreferencesDefaults)
    expect(userPreferencesSchema.parse({})).toEqual(userPreferencesDefaults)
  })

  test("preserves an explicitly unset locale", () => {
    expect(userPreferencesSchema.parse({ locale: null })).toEqual(userPreferencesDefaults)
  })

  test("keeps known values from rows written by a newer application version", () => {
    expect(userPreferencesSchema.parse({ locale: "de", futurePreference: true })).toEqual({
      ...userPreferencesDefaults,
      locale: "de"
    })
  })

  test("falls back safely when stored JSON is malformed", () => {
    expect(userPreferencesSchema.parse({ locale: "fr" })).toEqual(userPreferencesDefaults)
    expect(userPreferencesSchema.parse(null)).toEqual(userPreferencesDefaults)
  })

  test("gives rows saved before quick access the default shortcuts", () => {
    expect(userPreferencesSchema.parse({ locale: "sv" })).toEqual({
      locale: "sv",
      quickAccessEnabled: true,
      quickAccess: ["news", "messages"]
    })
  })

  test("keeps an empty quick-access list, which turns the bar off", () => {
    expect(userPreferencesSchema.parse({ quickAccess: [] }).quickAccess).toEqual([])
  })

  test("drops unknown and repeated shortcuts without losing other preferences", () => {
    expect(
      userPreferencesSchema.parse({ locale: "en", quickAccess: ["removedRoute", "messages", "messages", "news"] })
    ).toEqual({ locale: "en", quickAccessEnabled: true, quickAccess: ["messages", "news"] })
    expect(userPreferencesSchema.parse({ locale: "en", quickAccess: "news" })).toEqual({
      locale: "en",
      quickAccessEnabled: true,
      quickAccess: ["news", "messages"]
    })
  })

  test("limits stored shortcuts to what fits in the bar", () => {
    const stored = ["news", "newsCompose", "messages", "account", "accountSettings"] as const
    expect(userPreferencesSchema.parse({ quickAccess: stored }).quickAccess).toEqual(stored.slice(0, 4))
  })

  test("keeps the chosen shortcuts while the bar is turned off", () => {
    expect(userPreferencesSchema.parse({ quickAccessEnabled: false, quickAccess: ["account"] })).toEqual({
      locale: null,
      quickAccessEnabled: false,
      quickAccess: ["account"]
    })
  })

  test("falls back to showing the bar when the stored switch is malformed, without losing other preferences", () => {
    expect(userPreferencesSchema.parse({ locale: "de", quickAccessEnabled: "no" })).toEqual({
      ...userPreferencesDefaults,
      locale: "de"
    })
  })

  test("accepts only a boolean switch update", () => {
    expect(userPreferencesUpdateSchema.safeParse({ quickAccessEnabled: false }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ quickAccessEnabled: "off" }).success).toBe(false)
  })

  test("rejects shortcut updates that are unknown, repeated or too many", () => {
    expect(userPreferencesUpdateSchema.safeParse({ quickAccess: ["news", "adminUsers"] }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ quickAccess: ["home", "messages"] }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ quickAccess: [] }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ quickAccess: ["login"] }).success).toBe(false)
    expect(userPreferencesUpdateSchema.safeParse({ quickAccess: ["news", "news"] }).success).toBe(false)
    expect(
      userPreferencesUpdateSchema.safeParse({
        quickAccess: ["news", "newsCompose", "messages", "account", "accountSettings"]
      }).success
    ).toBe(false)
  })

  test("validates partial updates independently", () => {
    expect(userPreferencesUpdateSchema.parse({})).toEqual({})
    expect(userPreferencesUpdateSchema.safeParse({ locale: "de" }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ locale: null }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ locale: "fr" }).success).toBe(false)
    expect(userPreferencesUpdateSchema.safeParse({ unknownPreference: true }).success).toBe(false)
  })
})
