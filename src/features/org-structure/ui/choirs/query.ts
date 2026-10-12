import "server-only"

import type { Voice } from "@/features/voice/model"
import { type GroupSummary, listGroupSummaries } from "../group-summaries"

export type ChoirPlacement = { choir: GroupSummary; sections: GroupSummary[] }[]

const VOICE_ORDER: Voice[] = ["S", "S1", "S2", "A", "A1", "A2", "T", "T1", "T2", "B", "B1", "B2"]
const sectionOrder = (section: GroupSummary) => VOICE_ORDER.indexOf(section.voices[0] as Voice)

/** Every Choir with its Sections in score order, archived ones included, for placing singers. */
export async function getChoirPlacement(): Promise<ChoirPlacement> {
  const summaries = await listGroupSummaries()
  return summaries
    .filter(({ type }) => type === "Choir")
    .map((choir) => ({
      choir,
      sections: summaries
        .filter(({ choirId, type }) => choirId === choir.id && type === "Section")
        .sort((a, b) => sectionOrder(a) - sectionOrder(b))
    }))
}
