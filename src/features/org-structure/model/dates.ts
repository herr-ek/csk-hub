import type { IsoDate } from "./index"

/** Converts a validated calendar date by whole days in UTC, independent of daylight saving time. */
export function shiftDate(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
