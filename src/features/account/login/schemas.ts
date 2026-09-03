import z from "zod"
import { passwordField } from "@/shared/schemas"

export const loginSchema = z.object({
  identifier: z.string({ error: "Email or username is required." }).trim().min(1, "Email or username is required."),
  password: passwordField("Password"),
  rememberMe: z.boolean()
})
