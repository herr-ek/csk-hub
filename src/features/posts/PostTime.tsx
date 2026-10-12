import { getLocale } from "@/core/i18n/server"

const CHOIR_TIME_ZONE = "Europe/Stockholm"

/** A moment in a Post's life — published, edited, saved — in the choir's own time zone. */
export async function PostTime({ date, withTime, className }: { date: Date; withTime?: boolean; className?: string }) {
  const locale = await getLocale()
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: CHOIR_TIME_ZONE
  })
  return (
    <time dateTime={date.toISOString()} className={className}>
      {format.format(date)}
    </time>
  )
}
