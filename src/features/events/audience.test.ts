import { describe, expect, test } from "bun:test"
import type { VoiceDivision } from "@/features/voice/model"
import { type AudienceMembership, type AudienceTarget, inAudience } from "./audience"

// The scheme's "Targets and audience" examples, without a database. Groups are named by id.

const SECTIONS: Record<string, { choir: string; voices: VoiceDivision[] }> = {
  MKB1: { choir: "MK", voices: ["B1"] },
  MKB2: { choir: "MK", voices: ["B2"] },
  MKT1: { choir: "MK", voices: ["T1"] },
  KKB: { choir: "KK", voices: ["B1", "B2"] },
  KKS: { choir: "KK", voices: ["S1", "S2"] },
  DKA1: { choir: "DK", voices: ["A1"] }
}

/** A singer placed in a Section, which makes them a member of its Choir over the same dates. */
function singer(
  sectionId: string,
  voice: VoiceDivision,
  startDate = "2024-08-20",
  endDate: string | null = null
): AudienceMembership[] {
  const section = SECTIONS[sectionId]
  if (!section?.voices.includes(voice)) throw new Error(`${sectionId} does not sing ${voice}.`)
  return [
    { groupId: section.choir, groupType: "Choir", choirId: null, voice: null, startDate, endDate },
    { groupId: sectionId, groupType: "Section", choirId: section.choir, voice, startDate, endDate }
  ]
}

function member(groupId: string, startDate = "2024-08-20", endDate: string | null = null): AudienceMembership {
  return { groupId, groupType: "GigGroup", choirId: null, voice: null, startDate, endDate }
}

const choir = (groupId: string): AudienceTarget => ({ groupId, groupType: "Choir", voiceFamily: null })
const section = (groupId: string): AudienceTarget => ({ groupId, groupType: "Section", voiceFamily: null })
const gigGroup = (groupId: string): AudienceTarget => ({ groupId, groupType: "GigGroup", voiceFamily: null })
const voiceFamily = (family: "S" | "A" | "T" | "B", within?: AudienceTarget): AudienceTarget => ({
  groupId: within?.groupId ?? null,
  groupType: within?.groupType ?? null,
  voiceFamily: family
})

// 18:00 on 7 October 2026 in Stockholm.
const OCTOBER_7 = new Date("2026-10-07T16:00:00Z")

function audienceOf(targets: AudienceTarget[], users: Record<string, AudienceMembership[]>, startsAt = OCTOBER_7) {
  return Object.entries(users)
    .filter(([, memberships]) => inAudience(memberships, { startsAt, targets }))
    .map(([name]) => name)
}

const SINGERS = {
  kkBass: singer("KKB", "B2"),
  kkSoprano: singer("KKS", "S1"),
  mkBass1: singer("MKB1", "B1"),
  mkBass2: singer("MKB2", "B2"),
  mkTenor: singer("MKT1", "T1"),
  dkAlto: singer("DKA1", "A1"),
  gigger: [...singer("MKT1", "T1"), member("Alumnikväll")],
  noChoir: [member("Alumnikväll")],
  nobody: []
}

describe("inAudience", () => {
  test("no Targets: everyone with a Choir Membership on the day", () => {
    expect(audienceOf([], SINGERS)).toEqual([
      "kkBass",
      "kkSoprano",
      "mkBass1",
      "mkBass2",
      "mkTenor",
      "dkAlto",
      "gigger"
    ])
  })

  test("a Choir: its members", () => {
    expect(audienceOf([choir("KK")], SINGERS)).toEqual(["kkBass", "kkSoprano"])
  })

  test("a Section: its members", () => {
    expect(audienceOf([section("KKB")], SINGERS)).toEqual(["kkBass"])
  })

  test("a Voice family alone: MKB1, MKB2 and KKB members, each once", () => {
    expect(audienceOf([voiceFamily("B")], SINGERS)).toEqual(["kkBass", "mkBass1", "mkBass2"])
  })

  test("a Choir and a Voice family: that Choir's singers of the family", () => {
    expect(audienceOf([voiceFamily("B", choir("KK"))], SINGERS)).toEqual(["kkBass"])
    expect(audienceOf([voiceFamily("B", choir("MK"))], SINGERS)).toEqual(["mkBass1", "mkBass2"])
  })

  test("a Section and a Voice family: the Section's singers of the family", () => {
    expect(audienceOf([voiceFamily("B", section("MKB1"))], SINGERS)).toEqual(["mkBass1"])
    expect(audienceOf([voiceFamily("T", section("MKB1"))], SINGERS)).toEqual([])
  })

  test("a gig group: its members, Choir or not", () => {
    expect(audienceOf([gigGroup("Alumnikväll")], SINGERS)).toEqual(["gigger", "noChoir"])
  })

  test("a gig group and a Voice family: its members of the family, in any Section", () => {
    expect(audienceOf([voiceFamily("T", gigGroup("Alumnikväll"))], SINGERS)).toEqual(["gigger"])
    expect(audienceOf([voiceFamily("B", gigGroup("Alumnikväll"))], SINGERS)).toEqual([])
  })

  test("several Targets are OR'ed", () => {
    expect(audienceOf([section("KKB"), choir("DK"), gigGroup("Alumnikväll")], SINGERS)).toEqual([
      "kkBass",
      "dkAlto",
      "gigger",
      "noChoir"
    ])
  })

  test("Positions and roles play no part: someone in no group sees nothing", () => {
    expect(audienceOf([], { nobody: [] })).toEqual([])
  })

  describe("dated Memberships", () => {
    const leaving = singer("KKB", "B1", "2020-08-20", "2026-10-06")
    const joining = singer("KKB", "B1", "2026-10-08")
    const lastDay = singer("KKB", "B1", "2020-08-20", "2026-10-07")
    const firstDay = singer("KKB", "B1", "2026-10-07")

    test("count only on the Event's date, inclusive at both ends", () => {
      expect(audienceOf([choir("KK")], { leaving, joining, lastDay, firstDay })).toEqual(["lastDay", "firstDay"])
      expect(audienceOf([voiceFamily("B")], { leaving, joining, lastDay, firstDay })).toEqual(["lastDay", "firstDay"])
      expect(audienceOf([], { leaving, joining, lastDay, firstDay })).toEqual(["lastDay", "firstDay"])
    })

    test("a Voice change counts the Section the singer is in on the day", () => {
      const changed = [
        ...singer("MKT1", "T1", "2022-08-20", "2026-10-01"),
        ...singer("MKB1", "B1", "2026-10-01").filter(({ groupType }) => groupType === "Section")
      ]
      expect(inAudience(changed, { startsAt: OCTOBER_7, targets: [voiceFamily("B")] })).toBe(true)
      expect(inAudience(changed, { startsAt: OCTOBER_7, targets: [voiceFamily("T")] })).toBe(false)
      expect(inAudience(changed, { startsAt: new Date("2026-09-30T16:00:00Z"), targets: [voiceFamily("T")] })).toBe(
        true
      )
    })

    test("the date that counts is the start date in Stockholm, not in UTC", () => {
      // 00:30 on 8 October in Stockholm is still 7 October in UTC.
      const justAfterMidnight = new Date("2026-10-07T22:30:00Z")
      expect(inAudience(lastDay, { startsAt: justAfterMidnight, targets: [] })).toBe(false)
      expect(inAudience(joining, { startsAt: justAfterMidnight, targets: [] })).toBe(true)
    })
  })
})
