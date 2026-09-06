import { describe, expect, test } from "bun:test"
import { getLocaleCookieValue, localeCookie, writeLocaleCookie } from "./locale-cookie"
import { getSavedLocale, resolveLocalePreference } from "./locale-preference"
import { localeSchema } from "./locale-validation"
import { isLocale } from "./locales"

describe("locale validation", () => {
  test("accepts configured locales", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("sv")).toBe(true)
    expect(isLocale("de")).toBe(true)
    expect(localeSchema.safeParse("de").success).toBe(true)
  })

  test("rejects unsupported locales", () => {
    expect(isLocale("fr")).toBe(false)
    expect(localeSchema.safeParse("fr").success).toBe(false)
  })

  test("uses only supported saved member locales", () => {
    expect(getSavedLocale({ locale: "sv" })).toBe("sv")
    expect(getSavedLocale({ locale: "fr" })).toBeUndefined()
    expect(getSavedLocale(null)).toBeUndefined()
  })

  test("gives a valid browser cookie precedence over a saved member locale", () => {
    expect(resolveLocalePreference(getLocaleCookieValue("de"), getSavedLocale({ locale: "sv" }))).toBe("de")
    expect(resolveLocalePreference(getLocaleCookieValue(undefined), getSavedLocale({ locale: "sv" }))).toBe("sv")
    expect(resolveLocalePreference(getLocaleCookieValue("fr"), getSavedLocale({ locale: "de" }))).toBe("de")
  })

  test("uses only supported browser locale cookies", () => {
    expect(getLocaleCookieValue("de")).toBe("de")
    expect(getLocaleCookieValue("fr")).toBeUndefined()
    expect(getLocaleCookieValue(undefined)).toBeUndefined()
  })

  test("writes the shared locale cookie configuration", () => {
    const written: unknown[] = []
    writeLocaleCookie({ set: (cookie) => written.push(cookie) }, "de")

    expect(written).toEqual([{ ...localeCookie, value: "de" }])
  })
})
