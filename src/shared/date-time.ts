// Pure helpers behind the date and time fields. Values are the forms' own strings: a date
// `YYYY-MM-DD`, a time `HH:mm` and a wall-clock date and time `YYYY-MM-DDTHH:mm`.

const MINUTE = 60_000
const DAY_MINUTES = 24 * 60

const pad = (value: number) => String(value).padStart(2, "0")

function possibleTimeDigits(digits: string) {
  const hour = digits.slice(0, 2)
  const minute = digits.slice(2)
  return (hour.length < 2 || Number(hour) < 24) && (minute.length === 0 || Number(minute[0]) < 6)
}

/**
 * Typed text as it should read in a time box: digits only, `HH:mm`, with the colon added as soon
 * as the hour is complete, so the caret is already past it. An hour starting 3–9 can only be one
 * digit and gets its leading zero. A keystroke that cannot lead to a real time leaves `previous`.
 */
export function maskTime(text: string, previous: string, deleting: boolean): string {
  let digits = text.replace(/\D/g, "").slice(0, 4)
  if (/^[3-9]/.test(digits)) digits = `0${digits}`.slice(0, 4)
  if (!possibleTimeDigits(digits)) return previous
  if (digits.length > 2 || (digits.length === 2 && !deleting)) return `${digits.slice(0, 2)}:${digits.slice(2)}`
  return digits
}

/** Partly typed text completed to `HH:mm` (`9` → `09:00`, `18:3` → `18:30`), `""` for none, or null. */
export function completeTime(text: string): string | null {
  const digits = text.replace(/\D/g, "")
  if (digits.length === 0) return ""
  const full = (digits.length === 1 ? `0${digits}` : digits).padEnd(4, "0").slice(0, 4)
  const hour = Number(full.slice(0, 2))
  const minute = Number(full.slice(2))
  return hour < 24 && minute < 60 ? `${pad(hour)}:${pad(minute)}` : null
}

/** `time` moved by `minutes`, wrapping around midnight. */
export function stepTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number]
  const total = (((hour * 60 + minute + minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** A date-time value as its date and time, either of which may be empty. */
export function splitDateTime(value: string) {
  return { date: value.slice(0, 10), time: value.slice(11, 16) }
}

/** The date-time value of a date and a time, or `""` until both are there. */
export function joinDateTime({ date, time }: { date: string; time: string }) {
  return date && time ? `${date}T${time}` : ""
}

// Wall-clock values read as UTC, so a length ignores daylight saving: 19:00–21:30 stays so.
function wallClock(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) return null
  return Date.parse(value.length === 10 ? `${value}T00:00Z` : `${value}Z`)
}

/**
 * The end of an interval after its start moved from `previousStart` to `nextStart`. An end keeps
 * its length from the start, and a missing end becomes `fallbackMinutes` after the start. Dates
 * and date-times both work; an end stays put when there is no start to measure from.
 */
export function followStart(previousStart: string, nextStart: string, end: string, fallbackMinutes: number): string {
  const next = wallClock(nextStart)
  if (next === null) return end
  const previous = wallClock(previousStart)
  const current = wallClock(end)
  const moved =
    current === null ? next + fallbackMinutes * MINUTE : previous === null ? null : next + current - previous
  if (moved === null) return end
  const iso = new Date(moved).toISOString()
  return nextStart.length === 10 ? iso.slice(0, 10) : iso.slice(0, 16)
}
