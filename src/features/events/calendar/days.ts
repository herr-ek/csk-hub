import { type IsoDate, stockholmDate } from "../model"

/**
 * The first and last Stockholm calendar days an Event covers. An Event that ends at midnight,
 * as every all-day Event does, ends on the day before: 24–25 December runs to 00:00 on the 26th.
 */
export function eventDays({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  const firstDay: IsoDate = stockholmDate(startsAt)
  const lastDay: IsoDate = stockholmDate(new Date(endsAt.getTime() - 1))
  return { firstDay, lastDay: lastDay < firstDay ? firstDay : lastDay }
}

export type CalendarDay<T> = { day: IsoDate; events: T[] }

/** One month of a calendar, `YYYY-MM`, and its days in order. */
export type CalendarMonth<T> = { month: string; days: CalendarDay<T>[] }

/**
 * Events grouped by the Stockholm day they start on, and those days by month, keeping the order
 * the Events come in. An Event that spans several days is listed once, on its first.
 */
export function groupByDay<T extends { startsAt: Date }>(events: readonly T[]): CalendarMonth<T>[] {
  const months: CalendarMonth<T>[] = []
  for (const event of events) {
    const day = stockholmDate(event.startsAt)
    const month = day.slice(0, 7)
    let currentMonth = months.at(-1)
    if (currentMonth?.month !== month) {
      currentMonth = { month, days: [] }
      months.push(currentMonth)
    }
    let currentDay = currentMonth.days.at(-1)
    if (currentDay?.day !== day) {
      currentDay = { day, events: [] }
      currentMonth.days.push(currentDay)
    }
    currentDay.events.push(event)
  }
  return months
}
