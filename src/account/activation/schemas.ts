import { z } from "zod"
import { passwordField } from "@/shared/schemas"

export const activationSchema = z
  .object({
    password: passwordField("Password"),
    confirmPassword: passwordField("Confirm password")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  })
