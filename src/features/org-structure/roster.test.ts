import { describe, expect, test } from "bun:test"
import {
  cskPlacement,
  defaultStart,
  holdersByStatus,
  isVacant,
  missingChoirs,
  missingFamilies,
  type Placement,
  tenureStatus,
  yearPhase
} from "./roster"

const TODAY = "2026-11-25"
const placement = (overrides: Partial<Placement>): Placement => ({
  choirId: "mk",
  choirName: "MK",
  divided: true,
  voice: "B1",
  choirSince: "2024-08-20",
  ...overrides
})

describe("tenures and years", () => {
  test("an exclusive end belongs to the next holder", () => {
    expect(tenureStatus({ startDate: "2026-07-01", endDate: TODAY }, TODAY)).toBe("ended")
    expect(tenureStatus({ startDate: TODAY, endDate: null }, TODAY)).toBe("current")
    expect(tenureStatus({ startDate: "2026-11-26", endDate: null }, TODAY)).toBe("planned")
  })

  test("a year turns on 1 July", () => {
    expect(yearPhase(2026, "2027-06-30")).toBe("current")
    expect(yearPhase(2026, "2027-07-01")).toBe("ended")
    expect(yearPhase(2027, "2027-06-30")).toBe("planned")
  })

  test("changes start today, or on the first day of a year to come", () => {
    expect(defaultStart(null, TODAY)).toBe(TODAY)
    expect(defaultStart(2026, TODAY)).toBe(TODAY)
    expect(defaultStart(2027, TODAY)).toBe("2027-07-01")
    expect(defaultStart(2025, TODAY)).toBe("2026-06-30")
  })

  test("a planned holder fills a Position, an ended one leaves it vacant", () => {
    const ended = { startDate: "2026-07-01", endDate: "2026-09-01" }
    const planned = { startDate: "2027-01-01", endDate: "2027-07-01" }
    expect(isVacant({ holders: [ended] }, TODAY)).toBe(true)
    expect(isVacant({ holders: [ended, planned] }, TODAY)).toBe(false)
    expect(holdersByStatus([ended, planned], TODAY)).toEqual({ current: null, planned: [planned], ended: [ended] })
  })
})

describe("committee composition", () => {
  test("lists the Voice families and Choirs nobody covers", () => {
    expect(missingFamilies([{ voiceFamily: "S" }, { voiceFamily: "S" }, { voiceFamily: "T" }])).toEqual(["A", "B"])
    const [mk, dk, kk] = [{ id: "mk" }, { id: "dk" }, { id: "kk" }]
    expect(missingChoirs([mk, dk, kk], [{ choirs: [mk, kk] }])).toEqual([dk])
  })
})

describe("CSK as one choir", () => {
  test("counts a singer once, where they have sung longest", () => {
    const mk = placement({})
    const kk = placement({ choirId: "kk", choirName: "KK", divided: false, voice: "B2", choirSince: "2022-08-20" })
    expect(cskPlacement([mk, kk])).toEqual({ counted: kk, others: [mk] })
    expect(cskPlacement([])).toBeNull()
  })

  test("prefers a divided Choir on the same day", () => {
    const mk = placement({})
    const kk = placement({ choirId: "kk", choirName: "KK", divided: false, voice: "B2" })
    expect(cskPlacement([kk, mk])?.counted).toBe(mk)
  })
})
