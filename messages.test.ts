import { describe, expect, test } from "bun:test"
import de from "./messages/de.json"
import en from "./messages/en.json"
import sv from "./messages/sv.json"
import { type Locale, locales } from "./src/core/i18n/locales"

const messages = { en, sv, de } satisfies Record<Locale, object>

function messageKeys(messages: object, parentKey = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const messageKey = parentKey ? `${parentKey}.${key}` : key

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return messageKeys(value, messageKey)
    }

    return messageKey
  })
}

describe("translation catalogues", () => {
  const englishKeys = messageKeys(en).sort()

  for (const locale of locales) {
    test(`${locale} has the same message keys as English`, () => {
      expect(messageKeys(messages[locale]).sort()).toEqual(englishKeys)
    })
  }
})
