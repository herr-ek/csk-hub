const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** Plain-text toast preview, bounded without cutting a combined emoji in half. */
export function messageSnippet(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim()
  let count = 0
  for (const { index } of graphemes.segment(normalized)) {
    if (count++ === 400) return `${normalized.slice(0, index)}…`
  }
  return normalized
}
