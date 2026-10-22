import { currentOrganisationYear, GroupType, organisationYearPeriod } from "@/core/org-structure"
import type { getCareer } from "../query"

export type CareerRecord = Awaited<ReturnType<typeof getCareer>>["records"][number]

/** Chronological July–June chapters; a continuing period appears in each year it actually overlaps. */
export function careerChapters(records: CareerRecord[], through: string) {
  const started = records.filter((record) => record.startDate <= through)
  if (started.length === 0) return []
  const first = currentOrganisationYear(
    started.reduce((date, record) => (record.startDate < date ? record.startDate : date), through)
  )
  const last = currentOrganisationYear(through)
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const year = first + index
    const period = organisationYearPeriod(year)
    const scopes = new Map<
      string,
      {
        id: string
        name: string | null
        entries: {
          key: string
          kind: CareerRecord["kind"]
          label: string
          positionCode: CareerRecord["positionCode"]
          periods: CareerRecord[]
        }[]
      }
    >()
    for (const record of started.filter(
      (record) => record.startDate < period.endDate && (record.endDate === null || record.endDate > period.startDate)
    )) {
      const id = record.scopeId ?? "csk"
      const scope = scopes.get(id) ?? { id, name: record.scopeName, entries: [] }
      scopes.set(id, scope)
      const key = `${record.kind}:${record.groupId}:${record.kind === "position" ? record.positionCode : ""}`
      let entry = scope.entries.find((entry) => entry.key === key)
      if (!entry) {
        entry = {
          key,
          kind: record.kind,
          label: record.label,
          positionCode: record.kind === "position" ? record.positionCode : null,
          periods: []
        }
        scope.entries.push(entry)
      }
      entry.periods.push(record)
    }
    for (const part of scopes.values()) {
      const rank = (entry: (typeof part.entries)[number]) => {
        const record = entry.periods[0]
        return entry.kind === "position"
          ? 2
          : record?.groupId === part.id
            ? 0
            : record?.groupType === GroupType.Section
              ? 1
              : 3
      }
      part.entries.sort(
        (a, b) => rank(a) - rank(b) || (a.periods[0]?.startDate ?? "").localeCompare(b.periods[0]?.startDate ?? "")
      )
    }
    return {
      year,
      scopes: [...scopes.values()].sort(
        (a, b) => Number(b.id === "csk") - Number(a.id === "csk") || (a.name ?? "").localeCompare(b.name ?? "")
      )
    }
  })
}
