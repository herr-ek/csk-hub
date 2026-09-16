import type { JSONContent } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"
import { POST_HEADING_LEVELS, postBodyExtensions } from "./extensions"

/** One manager for the whole app: registering extensions is costly and the result is stateless. */
const manager = new MarkdownManager({ extensions: postBodyExtensions })

const MIN_HEADING_LEVEL = POST_HEADING_LEVELS[0]
const MAX_HEADING_LEVEL = POST_HEADING_LEVELS[POST_HEADING_LEVELS.length - 1]

/**
 * The parser reads `#` as level 1 whatever the Heading extension allows, so the level is
 * brought back into range here. Demoting keeps the words a dropped node would lose.
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
 * Read a stored Post body into the document the editor and the server renderer share.
 * Markdown outside the enabled set is dropped, and raw HTML survives only as text.
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
// Browsers strip control characters before resolving a URL, so `java\tscript:` reaches
// them as a scheme a check on the raw string would miss.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is exactly the point.
const IGNORED_BY_BROWSERS = /[\u0000-\u0020\u007f]/g

/**
 * The href a Post link may point at, or null when it may not point anywhere. Parsing
 * disarms pasted markup but not a pasted `[text](javascript:...)`, so the read path
 * never trusts a stored href.
 */
export function safePostLinkHref(href: unknown): string | null {
  if (typeof href !== "string") return null

  const candidate = href.replace(IGNORED_BY_BROWSERS, "")
  if (candidate === "") return null

  if (URL_SCHEME.test(candidate)) {
    return ALLOWED_URL_SCHEME.test(candidate) ? candidate : null
  }

  // `//host` is an external destination in a relative URL's clothes; the rest are Hub paths.
  return candidate.startsWith("//") ? null : candidate
}
