import type { GroupType } from "@/features/org-structure/model"
import type { VoiceFamily } from "@/features/voice/model"

/** How a Rehearsal is labelled, derived from its Targets and Series, never stored. */
export type RehearsalKind = "ChoirRehearsal" | "ExtraRehearsal" | "SectionalRehearsal" | "Rehearsal"

type KindTarget = { groupType: GroupType | null; voiceFamily: VoiceFamily | null }

/**
 * A Rehearsal for one whole Choir is a Choir rehearsal in a Series and an Extra rehearsal outside
 * one. One whose every Target is a Section or a Voice family is a Sectional rehearsal. Anything
 * else (no Targets, several Choirs, gig groups, mixed shapes) is just a Rehearsal.
 */
export function rehearsalKind(rehearsal: { seriesId: string | null; targets: readonly KindTarget[] }): RehearsalKind {
  const [only, ...others] = rehearsal.targets
  const choirOnly = only !== undefined && others.length === 0 && only.groupType === "Choir" && only.voiceFamily === null
  if (choirOnly) return rehearsal.seriesId === null ? "ExtraRehearsal" : "ChoirRehearsal"

  const sectional =
    rehearsal.targets.length > 0 &&
    rehearsal.targets.every(({ groupType, voiceFamily }) => groupType === "Section" || voiceFamily !== null)
  return sectional ? "SectionalRehearsal" : "Rehearsal"
}
