import { z } from "zod"
import { postDocument } from "../post-document"

export const POST_TITLE_MAX_LENGTH = 200

/**
 * The body field carries the editor's document as JSON. Anything the Post schema will
 * not accept fails the form rather than reaching the column.
 */
const postBodySchema = z.string().transform((value, ctx) => {
  const document = postDocument.parse(value)
  if (!document) {
    ctx.addIssue({ code: "custom", message: "The body is empty or is not a Post document." })
    return z.NEVER
  }
  return document
})

/** A Post's title and body as every compose form submits them, new or edited. */
export const postFormSchema = z.object({
  title: z.string().trim().min(1).max(POST_TITLE_MAX_LENGTH),
  body: postBodySchema
})

export type PostFormInput = z.infer<typeof postFormSchema>
