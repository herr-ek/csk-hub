import { expect, test } from "bun:test"
import { GroupType } from "@/core/org-structure"
import type { GroupSummary } from "../group-summaries"
import { archivedOrganisationYears, groupsForView } from "./group-view"

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
    members: []
  }
}

test("each Group appears in exactly one period, including completed years and manually archived continuing groups", () => {
  const groups = [
    group("current", "current"),
    group("future", "future"),
    group("completed", "completed"),
    { ...group("retired", "current", false), type: GroupType.Other, organisationYear: null }
  ]
  const choir = { ...group("MK", "current"), type: GroupType.Choir, organisationYear: null }
  const teams = [
    group("current-team", "current"),
    { ...group("archived-team", "current", false), type: GroupType.PartyTeam, organisationYear: null }
  ]
  const overview = { cskWide: groups, choirs: [{ choir, groups: teams }] }
  const current = groupsForView(overview, "current")
  const future = groupsForView(overview, "future")
  const archived = groupsForView(overview, "archived")
  expect(current.cskWide.map((row) => row.id)).toEqual(["current"])
  expect(future.cskWide.map((row) => row.id)).toEqual(["future"])
  expect(archived.cskWide.map((row) => row.id)).toEqual(["completed", "retired"])
  expect(current.choirs[0]?.groups.map((row) => row.id)).toEqual(["current-team"])
  expect(future.choirs).toEqual([])
  expect(archived.choirs[0]?.groups.map((row) => row.id)).toEqual(["archived-team"])
  expect([...current.cskWide, ...future.cskWide, ...archived.cskWide]).toHaveLength(groups.length)
})

test("archives select exactly one annual year, retaining undated identities separately and allowing gaps", () => {
  const annual = (id: string, year: number) => ({ ...group(id, "completed"), organisationYear: year })
  const undated = { ...group("undated", "current", false), type: GroupType.Other, organisationYear: null }
  const team = { ...group("old-team", "current", false), type: GroupType.PartyTeam, organisationYear: null }
  const choir = { ...group("MK", "current"), type: GroupType.Choir, organisationYear: null }
  const overview = {
    cskWide: [annual("22", 2022), annual("24", 2024), annual("25", 2025), group("current", "current"), undated],
    choirs: [{ choir, groups: [team] }]
  }
  expect(archivedOrganisationYears(overview)).toEqual([2025, 2024, 2023, 2022])
  expect(groupsForView(overview, "archived", 2024).cskWide.map(({ id }) => id)).toEqual(["24"])
  expect(groupsForView(overview, "archived", 2024).choirs).toEqual([])
  expect(groupsForView(overview, "archived", 2023).cskWide).toEqual([])
  const withoutYear = groupsForView(overview, "archived", null)
  expect(withoutYear.cskWide.map(({ id }) => id)).toEqual(["undated"])
  expect(withoutYear.choirs[0]?.groups.map(({ id }) => id)).toEqual(["old-team"])
  expect(archivedOrganisationYears(withoutYear)).toEqual([])
  expect(archivedOrganisationYears({ cskWide: [], choirs: [] })).toEqual([])
})
