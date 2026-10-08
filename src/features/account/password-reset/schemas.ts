import { z } from "zod"
import { normalizedEmailSchema, passwordSchema, validationMessageIds } from "@/shared/schemas"

export const passwordResetRequestSchema = z.object({
  email: normalizedEmailSchema
})

export const passwordResetSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: validationMessageIds.passwordsMismatch,
    path: ["confirmPassword"]
  })
