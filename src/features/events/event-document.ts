import { createDocumentSchema, richText } from "@/features/rich-text"

/**
 * What an Event description may contain: emphasis, lists and links. This list is the whole of
 * the decision; the editor offers exactly these and the write path keeps nothing else. Events
 * have their own schema rather than the Posts one, so either can grow without the other.
 */
export const eventDocument = createDocumentSchema([richText.emphasis, richText.lists, richText.links])
