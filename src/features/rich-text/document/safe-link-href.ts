const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_URL_SCHEME = /^(?:https?|mailto):/i
// Browsers strip control characters before resolving a URL, so `java\tscript:` reaches
// them as a scheme a check on the raw string would miss.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is exactly the point.
const IGNORED_BY_BROWSERS = /[\u0000- \u007f]/g

/**
 * The href a link may point at, or null when it may not point anywhere. Applied when a
 * document is stored and again when one is read, so a row written under an older rule
 * cannot put an unsafe destination on the page.
 */
export function safeLinkHref(href: unknown): string | null {
  if (typeof href !== "string") return null

  const candidate = href.replace(IGNORED_BY_BROWSERS, "")
  if (candidate === "") return null

  if (URL_SCHEME.test(candidate)) {
    return ALLOWED_URL_SCHEME.test(candidate) ? candidate : null
  }

  // `//host` is an external destination in a relative URL's clothing; the rest are Hub paths.
  return candidate.startsWith("//") ? null : candidate
}
