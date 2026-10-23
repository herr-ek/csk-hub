import { timeZone } from "@/core/i18n/time-zone"

// Events are stored as instants and shown in the choirs' own time zone. A form speaks in
// wall-clock values in that zone; these convert between the two, across daylight saving.

/** A calendar date, `YYYY-MM-DD`. */
export type IsoDate = string

/** A wall-clock time in Europe/Stockholm, `YYYY-MM-DDTHH:mm`, as a `datetime-local` input gives it. */
export type LocalDateTime = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const wallClock = new Intl.DateTimeFormat("en-US", {
  timeZone,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
})

function wallClockParts(instant: Date) {
  const parts = Object.fromEntries(wallClock.formatToParts(instant).map(({ type, value }) => [type, value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

/** How far Stockholm's wall clock is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number) {
  const { year, month, day, hour, minute, second } = wallClockParts(new Date(instant))
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant / 1000) * 1000
}

/** The instant Stockholm's wall clock shows the given time. */
function fromWallClock(year: number, month: number, day: number, hour: number, minute: number): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  // The offset near the answer, then again at the answer, which settles it across a DST change.
  const first = asUtc - offsetAt(asUtc)
  return new Date(asUtc - offsetAt(first))
}

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value)
  return match !== null && isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function isLocalDateTime(value: string): value is LocalDateTime {
  const match = LOCAL_DATE_TIME.exec(value)
  return (
    match !== null &&
    isRealDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    Number(match[4]) < 24 &&
    Number(match[5]) < 60
  )
}

/**
 * The instant of a Stockholm date and wall-clock time: a `LocalDateTime`, or a date alone for
 * its midnight. Null when the value is not a real date or time.
 */
export function stockholmInstant(value: IsoDate | LocalDateTime): Date | null {
  if (isIsoDate(value)) {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number]
    return fromWallClock(year, month, day, 0, 0)
  }
  if (!isLocalDateTime(value)) return null
  const match = LOCAL_DATE_TIME.exec(value) as RegExpExecArray
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number]
  return fromWallClock(year, month, day, hour, minute)
}

const pad = (value: number) => String(value).padStart(2, "0")

/** The Stockholm calendar date of an instant. */
export function stockholmDate(instant: Date): IsoDate {
  const { year, month, day } = wallClockParts(instant)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** The Stockholm wall-clock time of an instant, as a `datetime-local` input takes it. */
export function stockholmLocalDateTime(instant: Date): LocalDateTime {
  const { year, month, day, hour, minute } = wallClockParts(instant)
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

/** The calendar date `days` after `date`; negative goes back. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
