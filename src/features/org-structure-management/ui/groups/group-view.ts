import type { GroupSummary } from "../group-summaries"
import type { GroupsOverview } from "./query"

export type GroupView = "current" | "future" | "archived"

/** Completed annual Groups and explicitly archived identities share the historical view. */
export function groupView(group: Pick<GroupSummary, "active" | "phase" | "organisationYear">): GroupView {
  if (group.organisationYear !== null) return group.phase === "completed" ? "archived" : group.phase
  return group.active ? "current" : "archived"
}

/** Selects one period and optionally a specific year (null selects undated Groups), retaining Choir context. */
export function groupsForView(
  overview: GroupsOverview,
  view: GroupView,
  organisationYear?: number | null
): GroupsOverview {
  const matches = (group: GroupSummary) =>
    groupView(group) === view && (organisationYear === undefined || group.organisationYear === organisationYear)
  return {
    cskWide: overview.cskWide.filter(matches),
    choirs: overview.choirs
      .map(({ choir, groups }) => ({ choir, groups: groups.filter(matches) }))
      .filter(({ choir, groups }) => groups.length > 0 || (view === "current" && choir.active))
  }
}

/** The complete range of archived annual years, newest first, including gaps between saved years. */
export function archivedOrganisationYears(overview: GroupsOverview): number[] {
  const groups = [...overview.cskWide, ...overview.choirs.flatMap(({ groups }) => groups)]
  const years = groups.flatMap((group) =>
    groupView(group) === "archived" && group.organisationYear !== null ? [group.organisationYear] : []
  )
  if (years.length === 0) return []
  const newest = Math.max(...years)
  const oldest = Math.min(...years)
  return Array.from({ length: newest - oldest + 1 }, (_, index) => newest - index)
}
