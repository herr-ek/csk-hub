import type { GroupType } from "@/features/org-structure/model"
import { familyOf, type VoiceDivision, type VoiceFamily } from "@/features/voice/model"
import { type IsoDate, stockholmDate } from "./model"

// Who an Event is for, computed from its Targets and the User's dated Memberships as of the
// Event's start date, never stored. This is the scheme's "Targets and audience" pseudo-code, kept
// pure so every Target shape can be tested without a database. Positions and permission roles
// play no part.

/** One of a User's Memberships, as `listMembershipsOfUser` reads it. */
export type AudienceMembership = {
  groupId: string
  groupType: GroupType
  /** The Choir the group belongs to; null for a CSK-wide group, a Choir among them. */
  choirId: string | null
  /** Set exactly on a Section Membership. */
  voice: VoiceDivision | null
  startDate: IsoDate
  /** Null while the Membership is current; the last day it counts. */
  endDate: IsoDate | null
}

/** One rule for who an Event is for: a group, a Voice family, or both. */
export type AudienceTarget = {
  groupId: string | null
  /** The type of `groupId`'s group, which decides the Sections a Voice family is looked for in. */
  groupType: GroupType | null
  voiceFamily: VoiceFamily | null
}

export type AudienceEvent = { startsAt: Date; targets: readonly AudienceTarget[] }

/**
 * Whether a User with these Memberships is in the Event's Audience. Only Memberships active on
 * the Event's start date in Europe/Stockholm count. No Targets means everyone with a Choir
 * Membership on that date. Several Targets are OR'ed; inside one, the group and the Voice family
 * are AND'ed, and the Voice family is matched through a Section Membership within the group's
 * scope: a Choir's own Sections, the Section itself, or every Section for any other group.
 */
export function inAudience(memberships: readonly AudienceMembership[], event: AudienceEvent): boolean {
  const day = stockholmDate(event.startsAt)
  const active = memberships.filter((membership) => isActiveOn(membership, day))

  if (event.targets.length === 0) return active.some(({ groupType }) => groupType === "Choir")
  return event.targets.some((target) => matches(target, active))
}

function isActiveOn(membership: AudienceMembership, day: IsoDate) {
  return membership.startDate <= day && (membership.endDate === null || membership.endDate >= day)
}

function matches(target: AudienceTarget, active: readonly AudienceMembership[]) {
  const groupOk = target.groupId === null || active.some(({ groupId }) => groupId === target.groupId)
  const voiceOk =
    target.voiceFamily === null ||
    active.some(
      (membership) =>
        membership.groupType === "Section" &&
        membership.voice !== null &&
        familyOf(membership.voice) === target.voiceFamily &&
        inScope(membership, target)
    )
  return groupOk && voiceOk
}

/** Whether a Section Membership lies within the Sections a Target's group covers. */
function inScope(sectionMembership: AudienceMembership, target: AudienceTarget) {
  if (target.groupId === null) return true
  if (target.groupType === "Choir") return sectionMembership.choirId === target.groupId
  if (target.groupType === "Section") return sectionMembership.groupId === target.groupId
  return true
}
