import { z } from "zod"
import { passwordSchema, validationMessageIds } from "@/shared/schemas"

export const activationSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: validationMessageIds.passwordsMismatch,
    path: ["confirmPassword"]
  })
