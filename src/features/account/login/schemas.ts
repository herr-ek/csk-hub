import z from "zod"
import { passwordSchema, validationMessageIds } from "@/shared/schemas"

export const loginSchema = z.object({
  identifier: z.string({ error: validationMessageIds.required }).trim().min(1, validationMessageIds.required),
  password: passwordSchema,
  rememberMe: z.boolean()
})
