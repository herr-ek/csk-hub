import type { part, voice } from "@/core/db/schema/groups"

/** The line someone sings. An attribute of a Section Membership, never a group of people. */
export type Voice = (typeof voice.enumValues)[number]

/** The voice family S/A/T/B. Derived from a Voice, never stored and never a group. */
export type Part = (typeof part.enumValues)[number]

const PART_OF_VOICE: Record<Voice, Part> = {
  S1: "S",
  S2: "S",
  A1: "A",
  A2: "A",
  T1: "T",
  T2: "T",
  B1: "B",
  B2: "B"
}

/** The only place Voice → Part is decided. */
export function voiceToPart(voice: Voice): Part {
  return PART_OF_VOICE[voice]
}

/** Every Voice in the given Part, in score order. */
export function voicesOfPart(part: Part): Voice[] {
  return (Object.keys(PART_OF_VOICE) as Voice[]).filter((voice) => PART_OF_VOICE[voice] === part)
}
