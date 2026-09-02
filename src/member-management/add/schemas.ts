import { z } from "zod"
import { normalizedEmailField } from "@/shared/schemas"

export const addMemberSchema = z.object({
  name: z.string({ error: "Name is required." }).trim().min(1, "Name is required."),
  email: normalizedEmailField("Email")
})
