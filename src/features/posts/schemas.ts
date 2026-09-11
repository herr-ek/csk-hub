import { z } from "zod"

export const POST_TITLE_MAX_LENGTH = 200

export const publishPostSchema = z.object({
  title: z.string().trim().min(1).max(POST_TITLE_MAX_LENGTH),
  body: z.string().trim().min(1)
})

export type PublishPostInput = z.infer<typeof publishPostSchema>
