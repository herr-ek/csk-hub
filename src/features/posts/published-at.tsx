const CHOIR_TIME_ZONE = "Europe/Stockholm"

import { getLocale } from "@/core/i18n/server"

export async function PublishedAt({ date, className }: { date: Date; className?: string }) {
  const locale = await getLocale()
  const publishedFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: CHOIR_TIME_ZONE
  })
  return (
    <time dateTime={date.toISOString()} className={className}>
      {publishedFormat.format(date)}
    </time>
  )
}
