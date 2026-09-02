import { z } from "zod"
import { passwordPolicy } from "@/shared/policy"

export function passwordField(label: string) {
  return z.string({ error: `${label} is required.` }).min(passwordPolicy.minPasswordLength, {
    message: `${label} must be at least ${passwordPolicy.minPasswordLength} characters.`
  })
}

export function normalizedEmailField(label: string) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .pipe(z.email({ message: `${label} must be a valid email address.` }).toLowerCase())
}
