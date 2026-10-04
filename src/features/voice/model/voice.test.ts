import { describe, expect, test } from "bun:test"
import { contains, divisionsOf, familyOf, isVoiceDivision, type Voice } from "./voice"

describe("familyOf", () => {
  test("maps every division to its family, and a family to itself", () => {
    const voices: Voice[] = ["S1", "S2", "A1", "A2", "T1", "T2", "B1", "B2", "S", "A", "T", "B"]
    expect(voices.map(familyOf)).toEqual(["S", "S", "A", "A", "T", "T", "B", "B", "S", "A", "T", "B"])
  })
})

describe("divisionsOf", () => {
  test("lists the divisions of a family", () => {
    expect(divisionsOf("B")).toEqual(["B1", "B2"])
    expect(divisionsOf("S")).toEqual(["S1", "S2"])
  })
})

describe("isVoiceDivision", () => {
  test("tells divisions from families", () => {
    expect(isVoiceDivision("B1")).toBe(true)
    expect(isVoiceDivision("B")).toBe(false)
  })
})

describe("contains", () => {
  test("a Voice contains itself, and a family its divisions", () => {
    expect(contains("B", "B1")).toBe(true)
    expect(contains("B", "B")).toBe(true)
    expect(contains("B1", "B1")).toBe(true)
  })

  test("a division contains no other Voice, and no family contains another family's divisions", () => {
    expect(contains("B1", "B")).toBe(false)
    expect(contains("B1", "B2")).toBe(false)
    expect(contains("T", "B1")).toBe(false)
  })
})
