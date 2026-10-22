import type { GroupSummary } from "../group-summaries"
import type { GroupsOverview } from "./query"

export type GroupView = "current" | "future" | "archived"

/** Completed annual Groups and explicitly archived identities share the historical view. */
export function groupView(group: Pick<GroupSummary, "active" | "phase">): GroupView {
  return !group.active || group.phase === "completed" ? "archived" : group.phase
}

/** Selects one mutually exclusive view, retaining Choirs as context for their matching teams. */
export function groupsForView(overview: GroupsOverview, view: GroupView): GroupsOverview {
  return {
    cskWide: overview.cskWide.filter((group) => groupView(group) === view),
    choirs: overview.choirs
      .map(({ choir, groups }) => ({ choir, groups: groups.filter((group) => groupView(group) === view) }))
      .filter(({ choir, groups }) => groups.length > 0 || (view === "current" && choir.active))
  }
}
