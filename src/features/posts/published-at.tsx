const CHOIR_TIME_ZONE = "Europe/Stockholm"

const publishedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: CHOIR_TIME_ZONE
})

export function PublishedAt({ date, className }: { date: Date; className?: string }) {
  return (
    <time dateTime={date.toISOString()} className={className}>
      {publishedFormat.format(date)}
    </time>
  )
}
