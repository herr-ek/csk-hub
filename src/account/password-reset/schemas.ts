import { z } from "zod"
import { normalizedEmailField, passwordField } from "@/shared/schemas"

export const passwordResetRequestSchema = z.object({
  email: normalizedEmailField("Email")
})

export const passwordResetSchema = z
  .object({
    email: normalizedEmailField("Email"),
    password: passwordField("Password"),
    confirmPassword: passwordField("Confirm password")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  })
