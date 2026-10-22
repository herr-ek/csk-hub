import { expect, test } from "bun:test"
import { GroupType } from "@/core/org-structure"
import type { GroupSummary } from "../group-summaries"
import { groupsForView } from "./group-view"

function group(id: string, phase: GroupSummary["phase"], active = true): GroupSummary {
  return {
    id,
    name: id,
    type: GroupType.Board,
    choirId: null,
    organisationYear: 2026,
    active,
    phase,
    memberCount: 0,
    voices: [],
    holders: []
  }
}

test("each Group appears in exactly one period, including completed and archived future identities", () => {
  const groups = [
    group("current", "current"),
    group("future", "future"),
    group("completed", "completed"),
    group("archived-current", "current", false),
    group("archived-future", "future", false)
  ]
  const choir = { ...group("MK", "current"), type: GroupType.Choir, organisationYear: null }
  const teams = [group("current-team", "current"), group("archived-team", "current", false)]
  const overview = { cskWide: groups, choirs: [{ choir, groups: teams }] }
  const current = groupsForView(overview, "current")
  const future = groupsForView(overview, "future")
  const archived = groupsForView(overview, "archived")
  expect(current.cskWide.map((row) => row.id)).toEqual(["current"])
  expect(future.cskWide.map((row) => row.id)).toEqual(["future"])
  expect(archived.cskWide.map((row) => row.id)).toEqual(["completed", "archived-current", "archived-future"])
  expect(current.choirs[0]?.groups.map((row) => row.id)).toEqual(["current-team"])
  expect(future.choirs).toEqual([])
  expect(archived.choirs[0]?.groups.map((row) => row.id)).toEqual(["archived-team"])
  expect([...current.cskWide, ...future.cskWide, ...archived.cskWide]).toHaveLength(groups.length)
})
