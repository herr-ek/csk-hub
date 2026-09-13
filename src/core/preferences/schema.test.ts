import { describe, expect, test } from "bun:test"
import { userPreferencesDefaults, userPreferencesSchema, userPreferencesUpdateSchema } from "./schema"

describe("user preferences validation", () => {
  test("returns a complete preference object from stored values", () => {
    expect(userPreferencesSchema.parse({ locale: "en" })).toEqual({ locale: "en" })
  })

  test("uses defaults for missing rows and fields", () => {
    expect(userPreferencesSchema.parse(undefined)).toEqual(userPreferencesDefaults)
    expect(userPreferencesSchema.parse({})).toEqual(userPreferencesDefaults)
  })

  test("keeps known values from rows written by a newer application version", () => {
    expect(userPreferencesSchema.parse({ locale: "de", futurePreference: true })).toEqual({ locale: "de" })
  })

  test("falls back safely when stored JSON is malformed", () => {
    expect(userPreferencesSchema.parse({ locale: "fr" })).toEqual(userPreferencesDefaults)
    expect(userPreferencesSchema.parse(null)).toEqual(userPreferencesDefaults)
  })

  test("validates partial updates independently", () => {
    expect(userPreferencesUpdateSchema.parse({})).toEqual({})
    expect(userPreferencesUpdateSchema.safeParse({ locale: "de" }).success).toBe(true)
    expect(userPreferencesUpdateSchema.safeParse({ locale: "fr" }).success).toBe(false)
    expect(userPreferencesUpdateSchema.safeParse({ unknownPreference: true }).success).toBe(false)
  })
})
