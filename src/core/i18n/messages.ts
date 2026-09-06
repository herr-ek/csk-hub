import "server-only"
import de from "@messages/de.json"
import en from "@messages/en.json"
import sv from "@messages/sv.json"
import type { Locale } from "./locales"

const messages = { en, sv, de }

export function getMessages(locale: Locale) {
  return messages[locale]
}
