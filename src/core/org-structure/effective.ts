import type { directMembership, section } from "@/core/db/schema/org-structure"

import type { GroupType, IsoDate, PositionCode } from "./index"

type Voice = (typeof section.$inferSelect)["voice"]
type VoiceDivision = NonNullable<(typeof directMembership.$inferSelect)["voice"]>

export type EffectivePosition = {
  id: string
  positionCode: PositionCode | null
  name: string
  contextGroupId: string
  contextName: string | null
  contextType: GroupType
  contextChoirId: string | null
  contextChoirName: string | null
  organisationYear: number | null
  startDate: IsoDate
  endDate: IsoDate | null
  grantedGroups: {
    id: string
    name: string | null
    type: GroupType
    choirId: string | null
    organisationYear: number | null
  }[]
  affiliationGroups: {
    id: string
    name: string | null
    choirName: string | null
    type: GroupType
    choirId: string | null
  }[]
}

export type EffectiveGroup = {
  groupId: string
  name: string | null
  type: GroupType
  choirId: string | null
  choirName: string | null
  active: boolean
  organisationYear: number | null
  startDate: IsoDate
  endDate: IsoDate | null
  voice: VoiceDivision | null
  sectionVoice: Voice | null
  membershipPeriods: {
    id: string
    source: "direct" | "appointment"
    startDate: IsoDate
    endDate: IsoDate | null
    voice: VoiceDivision | null
  }[]
  positions: EffectivePosition[]
}
