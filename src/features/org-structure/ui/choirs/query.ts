import "server-only"

import { requirePermission } from "@/core/authz"

import { compareVoices, type Voice } from "@/features/voice/model"
import { type GroupSummary, listGroupSummaries } from "../group-summaries"

export type ChoirPlacement = { choir: GroupSummary; sections: GroupSummary[] }[]

const bySectionVoice = (a: GroupSummary, b: GroupSummary) => compareVoices(a.voices[0] as Voice, b.voices[0] as Voice)

/** Every Choir with its Sections in score order, archived ones included, for placing singers. */
export async function getChoirPlacement(): Promise<ChoirPlacement> {
  await requirePermission({ action: "org.manage" })
  const summaries = await listGroupSummaries()
  return summaries
    .filter(({ type }) => type === "Choir")
    .map((choir) => ({
      choir,
      sections: summaries.filter(({ choirId, type }) => choirId === choir.id && type === "Section").sort(bySectionVoice)
    }))
}
