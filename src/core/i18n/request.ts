import { notFound } from "next/navigation"
import { locale } from "next/root-params"
import { getRequestConfig } from "next-intl/server"
import { isLocale } from "./locales"
import { getMessages } from "./messages"
import { timeZone } from "./time-zone"

export default getRequestConfig(async () => {
  const requestedLocale = await locale()

  if (!isLocale(requestedLocale)) {
    notFound()
  }

  return {
    locale: requestedLocale,
    messages: getMessages(requestedLocale),
    timeZone
  }
})
