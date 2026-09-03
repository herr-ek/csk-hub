import { z } from "zod"

export const POST_TITLE_MAX_LENGTH = 200

export const publishPostSchema = z.object({
  title: z
    .string({ error: "Title is required." })
    .trim()
    .min(1, "Title is required.")
    .max(POST_TITLE_MAX_LENGTH, `Title must be ${POST_TITLE_MAX_LENGTH} characters or fewer.`),
  body: z.string({ error: "Body is required." }).trim().min(1, "Body is required.")
})

export type PublishPostInput = z.infer<typeof publishPostSchema>
