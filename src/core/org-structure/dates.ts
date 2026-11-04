import { timeZone } from "@/core/i18n/time-zone"
import type { IsoDate } from "./index"

/** Converts a validated calendar date by whole days in UTC, independent of daylight saving time. */
export function shiftDate(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** Whether adjacent and overlapping periods cover every date in a requested interval. */
export function periodsCoverPeriod(
  periods: readonly { startDate: IsoDate; endDate: IsoDate | null }[],
  target: { startDate: IsoDate; endDate: IsoDate | null }
) {
  let coveredUntil: IsoDate | null = target.startDate
  for (const period of periods.toSorted((left, right) => left.startDate.localeCompare(right.startDate))) {
    if (period.endDate !== null && period.endDate <= coveredUntil) continue
    if (period.startDate > coveredUntil) break
    if (period.endDate === null) return true
    coveredUntil = period.endDate
    if (target.endDate !== null && coveredUntil >= target.endDate) return true
  }
  return target.endDate !== null && coveredUntil !== null && coveredUntil >= target.endDate
}

/** The organisational year containing an already validated calendar date (July–June). */
export function currentOrganisationYear(today: IsoDate) {
  return Number(today.slice(0, 4)) - (today.slice(5) < "07-01" ? 1 : 0)
}

/** Historical backfilling is allowed; future preparation stops at the following year. */
export function isAllowedOrganisationYear(year: number, today: IsoDate) {
  return Number.isInteger(year) && year >= 1000 && year <= Math.min(9998, currentOrganisationYear(today) + 1)
}

/** Today's calendar date in the organisation's time zone. */
export function cskToday(): IsoDate {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date()) as IsoDate
}
