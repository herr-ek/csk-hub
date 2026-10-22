import "server-only"

import { GroupType } from "@/core/org-structure"

import { type GroupSummary, listGroupSummaries } from "../group-summaries"

export type GroupsOverview = {
  /** CSK-wide groups other than the Choirs, ordered by type then name. */
  cskWide: GroupSummary[]
  /** Each Choir with its groups other than the Sections, which the Choirs page shows. */
  choirs: { choir: GroupSummary; groups: GroupSummary[] }[]
}

/** Every group but the Choirs and their Sections, archived ones included, for the groups page. */
export async function getGroupsOverview(): Promise<GroupsOverview> {
  const summaries = await listGroupSummaries()
  return {
    cskWide: summaries
      .filter(({ choirId, type }) => choirId === null && type !== GroupType.Choir)
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "sv")),
    choirs: summaries
      .filter(({ type }) => type === GroupType.Choir)
      .map((choir) => ({
        choir,
        groups: summaries.filter(({ choirId, type }) => choirId === choir.id && type !== GroupType.Section)
      }))
  }
}
