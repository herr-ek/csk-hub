import { z } from "zod"
import { passwordSchema, validationMessageIds } from "@/shared/schemas"

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: validationMessageIds.required }).min(1, validationMessageIds.required),
    newPassword: passwordSchema,
    confirmation: passwordSchema
  })
  .refine((value) => value.newPassword === value.confirmation, {
    message: validationMessageIds.passwordsMismatch,
    path: ["confirmation"]
  })
