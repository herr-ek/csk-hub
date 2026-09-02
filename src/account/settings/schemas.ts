import { z } from "zod"
import { passwordField } from "@/shared/schemas"

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "Current password is required." }).min(1, "Current password is required."),
    newPassword: passwordField("New password"),
    confirmation: passwordField("Confirm password")
  })
  .refine((value) => value.newPassword === value.confirmation, {
    message: "The new passwords do not match.",
    path: ["confirmation"]
  })
