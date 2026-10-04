import { z } from "zod"
import { groupType } from "@/core/db/schema/org-structure"
import { voice } from "@/core/db/schema/voice"
import { NAME_MAX_LENGTH } from "./limits"

/** Form field schemas shared by the admin groups Server Actions. */
export const fields = {
  id: z.uuid(),
  userId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  date: z.iso.date(),
  voice: z.enum(voice.enumValues),
  groupType: z.enum(groupType.enumValues),
  /** A type a group can be created with; Choirs and Sections are created only with their Choir. */
  creatableGroupType: z.enum(groupType.enumValues).exclude(["Choir", "Section"])
}

/** A form value, with an empty string read as absent. */
export function value(formData: FormData, name: string) {
  const raw = formData.get(name)
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined
}
