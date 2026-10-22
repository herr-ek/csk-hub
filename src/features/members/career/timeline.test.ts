import { expect, test } from "bun:test"
import { GroupType, PositionCode } from "@/core/org-structure"
import { type CareerRecord, careerChapters } from "./timeline"

function record(values: Partial<CareerRecord>): CareerRecord {
  return {
    id: crypto.randomUUID(),
    kind: "membership",
    groupId: "choir",
    groupType: GroupType.Choir,
    label: "Choir",
    scopeId: "choir",
    scopeName: "Choir",
    active: true,
    startDate: "2024-07-01",
    endDate: null,
    voice: null,
    positionCode: null,
    sourceContext: null,
    ...values
  }
}

test("career chapters preserve July boundaries, voice changes, archived history and both tenures of a returning holder", () => {
  const chapters = careerChapters(
    [
      record({ startDate: "2023-08-01", endDate: "2024-07-01", voice: "S1" }),
      record({ startDate: "2024-07-01", endDate: "2025-07-01", voice: "S2" }),
      record({
        kind: "position",
        groupId: "board",
        label: "Board",
        scopeId: null,
        scopeName: null,
        active: false,
        positionCode: PositionCode.Chair,
        startDate: "2024-07-01",
        endDate: "2024-10-01"
      }),
      record({
        kind: "position",
        groupId: "board",
        label: "Board",
        scopeId: null,
        scopeName: null,
        active: false,
        positionCode: PositionCode.Chair,
        startDate: "2025-01-01",
        endDate: "2025-07-01"
      }),
      record({ startDate: "2027-01-01", label: "Prepared" })
    ],
    "2026-10-22"
  )
  expect(chapters.map(({ year }) => year)).toEqual([2023, 2024, 2025, 2026])
  expect(chapters[0]?.scopes[0]?.entries[0]?.periods[0]?.voice).toBe("S1")
  expect(chapters[1]?.scopes.map(({ id }) => id)).toEqual(["csk", "choir"])
  expect(chapters[1]?.scopes[0]?.entries).toHaveLength(1)
  expect(chapters[1]?.scopes[0]?.entries[0]?.periods).toHaveLength(2)
  expect(chapters[1]?.scopes[1]?.entries[0]?.periods.map(({ voice }) => voice)).toEqual(["S2"])
  expect(chapters[2]?.scopes).toEqual([])
  expect(careerChapters([record({ startDate: "2027-01-01" })], "2026-10-22")).toEqual([])
})
