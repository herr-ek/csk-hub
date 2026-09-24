import { createDocumentSchema, richText } from "@/features/rich-text"

/** The heading levels a Post body may contain; h1 belongs to the Post title. */
export const POST_HEADING_LEVELS = [2, 3] as const

/**
 * What a Post body may contain. This list is the whole of the decision: the editor
 * offers exactly these, the write path refuses anything else, and the read path draws
 * them. h1 is left out because the title is the h1.
 */
export const postDocument = createDocumentSchema([
  richText.headings(POST_HEADING_LEVELS),
  richText.emphasis,
  richText.links,
  richText.lists,
  richText.blockquotes,
  richText.dividers,
  richText.tables
])
