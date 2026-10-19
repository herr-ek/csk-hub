import { describe, expect, test } from "bun:test"
import { rehearsalKind } from "./rehearsal-kind"

const kk = { groupType: "Choir" as const, voiceFamily: null }
const mk = { groupType: "Choir" as const, voiceFamily: null }
const kkb = { groupType: "Section" as const, voiceFamily: null }
const basses = { groupType: null, voiceFamily: "B" as const }
const kkBasses = { groupType: "Choir" as const, voiceFamily: "B" as const }
const gigGroup = { groupType: "GigGroup" as const, voiceFamily: null }

describe("rehearsalKind", () => {
  test("one whole Choir: a Choir rehearsal in a Series, an Extra rehearsal outside one", () => {
    expect(rehearsalKind({ seriesId: "kk-ht26", targets: [kk] })).toBe("ChoirRehearsal")
    expect(rehearsalKind({ seriesId: null, targets: [kk] })).toBe("ExtraRehearsal")
  })

  test("every Target a Section or a Voice family: a Sectional rehearsal, in a Series or not", () => {
    expect(rehearsalKind({ seriesId: null, targets: [kkb] })).toBe("SectionalRehearsal")
    expect(rehearsalKind({ seriesId: null, targets: [kkBasses] })).toBe("SectionalRehearsal")
    expect(rehearsalKind({ seriesId: "series", targets: [basses, kkb] })).toBe("SectionalRehearsal")
  })

  test("anything else is a Rehearsal", () => {
    expect(rehearsalKind({ seriesId: "series", targets: [] })).toBe("Rehearsal")
    expect(rehearsalKind({ seriesId: "series", targets: [kk, mk] })).toBe("Rehearsal")
    expect(rehearsalKind({ seriesId: null, targets: [gigGroup] })).toBe("Rehearsal")
    expect(rehearsalKind({ seriesId: null, targets: [kkb, kk] })).toBe("Rehearsal")
  })
})
