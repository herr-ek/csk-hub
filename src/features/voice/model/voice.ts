import type { voice } from "@/core/db/schema/voice"

/**
 * A line someone sings, at either granularity: a family (B) or one of its divisions (B1). Never a
 * group of people.
 */
export type Voice = (typeof voice.enumValues)[number]

/** S1 … B2: a Voice line when its family splits, as B1 in TTBB. */
export type VoiceDivision = Extract<Voice, `${string}${1 | 2}`>

/** S, A, T, B: a whole Voice line in an undivided setting, as B in SATB. */
export type VoiceFamily = Exclude<Voice, VoiceDivision>

const DIVISIONS_OF_FAMILY: Record<VoiceFamily, VoiceDivision[]> = {
  S: ["S1", "S2"],
  A: ["A1", "A2"],
  T: ["T1", "T2"],
  B: ["B1", "B2"]
}

export function isVoiceDivision(voice: Voice): voice is VoiceDivision {
  return !(voice in DIVISIONS_OF_FAMILY)
}

/** The only place a Voice's family is decided: B1 → B, and B → B. */
export function familyOf(voice: Voice): VoiceFamily {
  return (isVoiceDivision(voice) ? voice.charAt(0) : voice) as VoiceFamily
}

/** The divisions of a family, in score order. */
export function divisionsOf(family: VoiceFamily): VoiceDivision[] {
  return DIVISIONS_OF_FAMILY[family]
}

/**
 * Whether `outer` contains `inner`: they are equal, or `outer` is the family of the division
 * `inner`. B contains B and B1; B1 contains only B1.
 */
export function contains(outer: Voice, inner: Voice): boolean {
  return outer === inner || (!isVoiceDivision(outer) && familyOf(inner) === outer)
}
