/** Universal rules for reading a roster or a Position at a date. */
import { type IsoDate, organisationYearPeriod, shiftDate } from "@/core/org-structure"
import { familyOf, type VoiceDivision, type VoiceFamily } from "@/features/voice/model"

export type Tenure = { startDate: IsoDate; endDate: IsoDate | null }
export type TenureStatus = "ended" | "current" | "planned"

export function tenureStatus({ startDate, endDate }: Tenure, today: IsoDate): TenureStatus {
  if (endDate !== null && endDate <= today) return "ended"
  return startDate > today ? "planned" : "current"
}

/** How an Organisational year is written: 26/27. */
export function yearLabel(year: number) {
  return `${String(year).slice(-2)}/${String(year + 1).slice(-2)}`
}

/** The year to show: the one asked for when it can be stepped to, else the current one. */
export function selectedYear(requested: string | undefined, years: number[], current: number) {
  const year = Number(requested)
  return requested !== undefined && years.includes(year) ? year : current
}

/** Whether an Organisational year is over, running or still to come. */
export function yearPhase(year: number, today: IsoDate): TenureStatus {
  return tenureStatus(organisationYearPeriod(year), today)
}

/** The day a change in a year takes effect unless someone chooses another: today, or the year's first day. */
export function defaultStart(year: number | null, today: IsoDate): IsoDate {
  if (year === null) return today
  const { startDate, endDate } = organisationYearPeriod(year)
  if (today < startDate) return startDate
  return today < endDate ? today : shiftDate(endDate, -1)
}

/** Who holds a Position now and who is planned to. A finished year has no current holder. */
export function holdersByStatus<T extends Tenure>(holders: T[], today: IsoDate) {
  return {
    current: holders.find((holder) => tenureStatus(holder, today) === "current") ?? null,
    planned: holders.filter((holder) => tenureStatus(holder, today) === "planned"),
    ended: holders.filter((holder) => tenureStatus(holder, today) === "ended")
  }
}

/** A Position counts as vacant when nobody holds it now or, in a year to come, is planned to. */
export function isVacant(slot: { holders: Tenure[] }, today: IsoDate) {
  return slot.holders.every((holder) => tenureStatus(holder, today) === "ended")
}

export const VOICE_FAMILIES: readonly VoiceFamily[] = ["S", "A", "T", "B"]

export function missingFamilies(members: { voiceFamily: VoiceFamily | null }[]) {
  return VOICE_FAMILIES.filter((family) => !members.some((member) => member.voiceFamily === family))
}

/** Someone in two Choirs counts for both. */
export function missingChoirs<C extends { id: string }>(choirs: C[], members: { choirs: { id: string }[] }[]) {
  return choirs.filter(({ id }) => !members.some((member) => member.choirs.some((choir) => choir.id === id)))
}

export function singsFamily(voices: VoiceDivision[], family: VoiceFamily) {
  return voices.some((voice) => familyOf(voice) === family)
}

/** Someone who belongs to no Choir and is not about to. */
export function isUnplaced(person: { choirs: unknown[]; planned: unknown[] }) {
  return person.choirs.length === 0 && person.planned.length === 0
}

export type Placement = {
  choirId: string
  choirName: string
  /** Whether the Section sings a division, as in MK and DK, rather than a whole family, as in KK. */
  divided: boolean
  voice: VoiceDivision
  /** When they joined the Choir; a Voice change does not restart it. */
  choirSince: IsoDate
}

/**
 * The one place a singer takes when CSK sings as a single choir: where they have sung longest, and on
 * the same day the Choir with divided Sections. The rest are their other placements.
 */
export function cskPlacement<P extends Placement>(placements: P[]): { counted: P; others: P[] } | null {
  const [counted, ...others] = placements.toSorted(
    (a, b) => a.choirSince.localeCompare(b.choirSince) || Number(b.divided) - Number(a.divided)
  )
  return counted ? { counted, others } : null
}
