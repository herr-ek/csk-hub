import type { EventResult } from "./result"
import { addDays, type IsoDate, isIsoDate } from "./stockholm-time"

/** One run of the rehearsal generator creates at most a term of one weekday's rehearsals. */
export const MAX_SERIES_DATES = 26

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export function weekdayOf(date: IsoDate): Weekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return (day === 0 ? 7 : day) as Weekday
}

/**
 * Every `weekday` from `firstDay` to `lastDay`, both included. Refused when the range is
 * reversed, starts before `today`, holds no such weekday, or holds more than `MAX_SERIES_DATES`.
 */
export function weeklyDates(
  weekday: Weekday,
  firstDay: IsoDate,
  lastDay: IsoDate,
  today: IsoDate
): EventResult<IsoDate[]> {
  if (!isIsoDate(firstDay) || !isIsoDate(lastDay)) return { success: false, error: "invalid-date" }
  if (lastDay < firstDay) return { success: false, error: "last-day-before-first" }
  if (firstDay < today) return { success: false, error: "date-in-past" }

  const dates: IsoDate[] = []
  for (
    let date = addDays(firstDay, (weekday - weekdayOf(firstDay) + 7) % 7);
    date <= lastDay;
    date = addDays(date, 7)
  ) {
    if (dates.length === MAX_SERIES_DATES) return { success: false, error: "too-many-dates" }
    dates.push(date)
  }
  return dates.length > 0 ? { success: true, data: dates } : { success: false, error: "no-dates" }
}
