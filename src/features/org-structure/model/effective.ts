import type { Voice, VoiceDivision } from "@/features/voice/model"
import type { GroupType, IsoDate, PositionCode } from "./index"

export type EffectivePosition = {
  id: string
  positionCode: PositionCode | null
  name: string
  contextGroupId: string
  contextName: string
  contextType: GroupType
  contextChoirId: string | null
  contextChoirName: string | null
  organisationYear: number | null
  startDate: IsoDate
  endDate: IsoDate | null
  grantedGroups: {
    id: string
    name: string
    type: GroupType
    choirId: string | null
    organisationYear: number | null
  }[]
  affiliationGroups: { id: string; name: string; choirName: string | null; type: GroupType; choirId: string | null }[]
}

export type EffectiveGroup = {
  groupId: string
  name: string
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
    source: "direct" | "appointment" | "legacy"
    startDate: IsoDate
    endDate: IsoDate | null
    voice: VoiceDivision | null
  }[]
  positions: EffectivePosition[]
}
