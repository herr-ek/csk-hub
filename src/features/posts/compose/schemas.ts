import { z } from "zod"
import { validationMessageIds } from "@/shared/schemas"
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

/** Form/storage values retain incomplete rows so a rejected save does not lose other targets. */
export const postTargetValuesSchema = z
  .array(
    z.object({
      groupId: z.uuid().nullable(),
      voiceFamily: z.enum(["S", "A", "T", "B"]).nullable()
    })
  )
  .max(100)

/** Persisted rules must specify a Group or Voice family; duplicate rules are normalized. */
export const postTargetsSchema = postTargetValuesSchema
  .superRefine((targets, ctx) => {
    targets.forEach((target, index) => {
      if (target.groupId === null && target.voiceFamily === null)
        ctx.addIssue({ code: "custom", path: [index], message: validationMessageIds.audienceTargetIncomplete })
    })
  })
  .transform((targets) => [
    ...new Map(targets.map((target) => [JSON.stringify([target.groupId, target.voiceFamily]), target])).values()
  ])

/** Parse the hidden target payload without accepting malformed targets as an empty audience. */
export function parsePostTargets(value: string) {
  try {
    const parsed = postTargetValuesSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** A Post's title and body as every compose form submits them, new or edited. */
export const postFormSchema = z.object({
  title: z.string().trim().min(1).max(POST_TITLE_MAX_LENGTH),
  body: postBodySchema,
  publisherGroupId: z
    .union([z.uuid(), z.literal("")])
    .default("")
    .transform((id) => id || null),
  audienceAll: z.boolean().default(false),
  targets: postTargetsSchema.default([]),
  revision: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((value) => (value === undefined ? undefined : Number(value)))
})

export type PostFormInput = z.infer<typeof postFormSchema>
