import { defineRouting } from "next-intl/routing"
import { localeCookie } from "./locale-cookie"
import { defaultLocale, locales } from "./locales"

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
  localeCookie
})
