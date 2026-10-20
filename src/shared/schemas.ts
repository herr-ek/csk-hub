import { z } from "zod"
import { passwordPolicy } from "@/shared/policy"

export const validationMessageIds = {
  required: "validation.required",
  passwordTooShort: "validation.passwordTooShort",
  invalidEmail: "validation.invalidEmail",
  passwordsMismatch: "validation.passwordsMismatch"
} as const

export const passwordSchema = z
  .string({ error: validationMessageIds.required })
  .min(1, { message: validationMessageIds.required })
  .pipe(z.string().min(passwordPolicy.minPasswordLength, { message: validationMessageIds.passwordTooShort }))

export const normalizedEmailSchema = z
  .string({ error: validationMessageIds.required })
  .trim()
  .min(1, { message: validationMessageIds.required })
  .pipe(z.email({ message: validationMessageIds.invalidEmail }).toLowerCase())
