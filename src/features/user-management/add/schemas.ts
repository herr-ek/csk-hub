import { z } from "zod"
import { normalizedEmailSchema, validationMessageIds } from "@/shared/schemas"

export const addUserSchema = z.object({
  name: z.string({ error: validationMessageIds.required }).trim().min(1, validationMessageIds.required),
  email: normalizedEmailSchema
})
