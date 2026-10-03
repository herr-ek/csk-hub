import { describe, expect, test } from "bun:test"
import { voicesOfPart, voiceToPart } from "./voice"

describe("voiceToPart", () => {
  test("maps every Voice to its family", () => {
    expect(["S1", "S2", "A1", "A2", "T1", "T2", "B1", "B2"].map((voice) => voiceToPart(voice as never))).toEqual([
      "S",
      "S",
      "A",
      "A",
      "T",
      "T",
      "B",
      "B"
    ])
  })

  test("lists the Voices of a Part", () => {
    expect(voicesOfPart("B")).toEqual(["B1", "B2"])
    expect(voicesOfPart("S")).toEqual(["S1", "S2"])
  })
})
