import "server-only"

import { GroupType } from "@/core/org-structure"

import { compareVoices, type Voice } from "@/features/voice/model"
import { type GroupSummary, listGroupSummaries } from "../group-summaries"

export type ChoirPlacement = { choir: GroupSummary; sections: GroupSummary[] }[]

const bySectionVoice = (a: GroupSummary, b: GroupSummary) => compareVoices(a.voices[0] as Voice, b.voices[0] as Voice)

/** Every Choir with its Sections in score order, archived ones included, for placing singers. */
export async function getChoirPlacement(): Promise<ChoirPlacement> {
  const summaries = await listGroupSummaries()
  return summaries
    .filter(({ type }) => type === GroupType.Choir)
    .map((choir) => ({
      choir,
      sections: summaries
        .filter(({ choirId, type }) => choirId === choir.id && type === GroupType.Section)
        .sort(bySectionVoice)
    }))
}
