import type { JSONContent } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"
import { POST_HEADING_LEVELS, postBodyExtensions } from "./extensions"

/**
 * One manager for the whole app. Registering extensions is the expensive part and
 * the result is stateless, so parsing and serialising share a single instance.
 */
const manager = new MarkdownManager({ extensions: postBodyExtensions })

const MIN_HEADING_LEVEL = POST_HEADING_LEVELS[0]
const MAX_HEADING_LEVEL = POST_HEADING_LEVELS[POST_HEADING_LEVELS.length - 1]

/**
 * The Markdown parser reads `#` as a level-1 heading whatever the Heading extension
 * was configured to allow, so the level has to be brought back into range here
 * rather than left to the schema. Demoting keeps the words; dropping the node would
 * lose them, and h1 is the Post title's alone.
 */
function clampHeadingLevels(node: JSONContent): JSONContent {
  const content = node.content?.map(clampHeadingLevels)

  if (node.type !== "heading") {
    return content ? { ...node, content } : node
  }

  const level = Number(node.attrs?.level ?? MIN_HEADING_LEVEL)
  const inRange = Number.isFinite(level) ? level : MIN_HEADING_LEVEL
  const clamped = Math.min(Math.max(inRange, MIN_HEADING_LEVEL), MAX_HEADING_LEVEL)

  return { ...node, attrs: { ...node.attrs, level: clamped }, content }
}

/**
 * Read a stored Post body into the document both the editor and the server-side
 * renderer work on. Markdown the enabled set has no node for is dropped here, which
 * is the first half of the read path's sanitisation — raw HTML in the source
 * survives only as literal text, never as markup.
 */
export function parsePostMarkdown(markdown: string): JSONContent {
  return clampHeadingLevels(manager.parse(markdown))
}

/** Write a document back out as the Markdown string that gets stored (ADR-0004). */
export function serializePostMarkdown(document: JSONContent): string {
  return manager.serialize(document)
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_URL_SCHEME = /^(?:https?|mailto):/i
// Browsers strip control characters before resolving a URL, so `java\tscript:alert(1)`
// reaches them as a scheme that a check on the raw string does not recognise.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is exactly the point.
const IGNORED_BY_BROWSERS = /[\u0000-\u0020\u007f]/g

/**
 * The href a Post link may actually point at, or null when it may not point anywhere.
 *
 * Parsing Markdown into the enabled node set disarms pasted markup but not a pasted
 * `[text](javascript:...)`, which is a plain link as far as the parser is concerned.
 * This is the second half of the read path's sanitisation, and the reason the read
 * path never trusts a stored href.
 */
export function safePostLinkHref(href: unknown): string | null {
  if (typeof href !== "string") return null

  const candidate = href.replace(IGNORED_BY_BROWSERS, "")
  if (candidate === "") return null

  if (URL_SCHEME.test(candidate)) {
    return ALLOWED_URL_SCHEME.test(candidate) ? candidate : null
  }

  // `//host` is an external destination wearing a relative URL's clothes. Anything
  // else without a scheme is a path inside the Hub.
  return candidate.startsWith("//") ? null : candidate
}
