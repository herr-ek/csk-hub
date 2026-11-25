import { z } from "zod"
import { voice } from "@/core/db/schema/voice"
import { GroupType, PositionCode } from "@/core/org-structure"
import { isVoiceDivision, type VoiceDivision } from "@/features/voice/model"
import { NAME_MAX_LENGTH } from "./limits"

const creatableGroupTypes = Object.values(GroupType).filter(
  (type): type is Exclude<GroupType, GroupType.Choir | GroupType.Section> =>
    type !== GroupType.Choir && type !== GroupType.Section
)

/** Form field schemas shared by the admin groups Server Actions. */
export const fields = {
  id: z.uuid(),
  userId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  date: z.iso.date(),
  /** A singer's Voice, which is always a division. */
  voice: z.enum(voice.enumValues.filter(isVoiceDivision) as [VoiceDivision, ...VoiceDivision[]]),
  voiceFamily: z.enum(["S", "A", "T", "B"]),
  organisationYear: z.coerce.number().int().min(1000).max(9998),
  groupType: z.enum(GroupType),
  positionCode: z.enum(PositionCode),
  /** A type a group can be created with; Choirs and Sections are created only with their Choir. */
  creatableGroupType: z.enum(creatableGroupTypes)
}

/** Every non-empty value of a repeated field. */
export function values(formData: FormData, name: string) {
  return formData.getAll(name).filter((raw): raw is string => typeof raw === "string" && raw.trim() !== "")
}

/** A form value, with an empty string read as absent. */
export function value(formData: FormData, name: string) {
  const raw = formData.get(name)
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined
}
