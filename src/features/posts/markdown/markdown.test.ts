import { describe, expect, test } from "bun:test"
import { getSchema } from "@tiptap/core"
import { Node } from "@tiptap/pm/model"
import { postBodyExtensions } from "./extensions"
import { parsePostMarkdown, safePostLinkHref, serializePostMarkdown } from "./markdown"

const schema = getSchema(postBodyExtensions)

/**
 * Markdown → editor → Markdown, the round trip ADR-0004 obliges every enabled node to
 * survive. The document is rebuilt through the ProseMirror schema on the way past, so
 * a node the editor could not actually hold fails here rather than in a browser.
 */
function roundTrip(markdown: string): string {
  const parsed = parsePostMarkdown(markdown)
  const inEditor = Node.fromJSON(schema, parsed)
  return serializePostMarkdown(inEditor.toJSON())
}

describe("a Post body survives the round trip", () => {
  test("h2", () => {
    const markdown = "## Rehearsals in October"
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("h3", () => {
    const markdown = "### Tenors and basses"
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("bold", () => {
    const markdown = "Bring **the black folder**."
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("italic", () => {
    const markdown = "The concert is *not* cancelled."
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("bullet list", () => {
    const markdown = "- Black folder\n- Water bottle\n- A pencil"
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("ordered list", () => {
    const markdown = "1. Warm up\n2. Run the Brahms\n3. Sectionals"
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("link", () => {
    const markdown = "The rota is [on the noticeboard](https://example.org/rota)."
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("blockquote", () => {
    const markdown = "> Sing it like you mean it."
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("horizontal rule", () => {
    const markdown = "Before.\n\n---\n\nAfter."
    expect(roundTrip(markdown)).toBe(markdown)
  })

  test("table", () => {
    // Tables are the one node the serialiser rewrites rather than reproduces: it pads
    // the cells to a fixed width. The obligation is that no content moves and that the
    // rewrite settles, which is what a second trip through proves.
    const markdown = "| Week | Choir |\n| --- | --- |\n| 36 | MK |\n| 37 | KK |"
    const once = roundTrip(markdown)

    expect(roundTrip(once)).toBe(once)
    expect(once).toContain("| Week")
    expect(once).toContain("| 37")
    expect(once).toContain("| KK")
  })

  test("a whole Post, with every node at once", () => {
    const markdown = [
      "## Klokstäd",
      "",
      "The rota for the **autumn** term is below. Swap with someone if you cannot make it, and tell [the board](mailto:styrelsen@example.org).",
      "",
      "### What to bring",
      "",
      "- Rubber gloves",
      "- Good spirits",
      "",
      "> Nobody leaves before the floor is done.",
      "",
      "---",
      "",
      "1. Sign up",
      "2. Turn up"
    ].join("\n")

    expect(roundTrip(markdown)).toBe(markdown)
  })
})

describe("what a Post body may not contain", () => {
  test("demotes a level-1 heading, because h1 is the Post title's", () => {
    // The parser reads `#` as level 1 whatever the editor was configured to offer.
    expect(roundTrip("# A second title")).toBe("## A second title")
  })

  test("flattens a heading below h3 rather than inventing a level", () => {
    expect(roundTrip("#### Deep")).toBe("### Deep")
  })

  test("keeps pasted markup as words, never as markup", () => {
    const parsed = parsePostMarkdown("<script>alert(1)</script>")

    expect(JSON.stringify(parsed)).not.toContain('"type":"script"')
    expect(serializePostMarkdown(parsed)).toContain("script")
  })

  test("an empty document serialises to nothing, so the body still reads as missing", () => {
    expect(serializePostMarkdown({ type: "doc", content: [{ type: "paragraph" }] })).toBe("")
  })

  test("text that looks like Markdown is escaped, so it comes back as text", () => {
    const typed = "Use `bin/foo` and 5 * 3 and A_B_C"
    const document = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: typed }] }] }

    const stored = serializePostMarkdown(document)

    expect(parsePostMarkdown(stored).content?.[0]?.content?.[0]?.text).toBe(typed)
  })
})

describe("a link's destination", () => {
  test.each([
    ["https://example.org/rota", "https://example.org/rota"],
    ["http://example.org", "http://example.org"],
    ["mailto:styrelsen@example.org", "mailto:styrelsen@example.org"],
    ["/news/some-post", "/news/some-post"]
  ])("keeps %p", (href, expected) => {
    expect(safePostLinkHref(href)).toBe(expected)
  })

  test.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["java\tscript:alert(1)"],
    ["\u0000javascript:alert(1)"],
    ["  javascript:alert(1)"],
    ["data:text/html;base64,PHNjcmlwdD4="],
    ["vbscript:msgbox(1)"],
    ["//evil.example.com"],
    ["   "],
    [""]
  ])("refuses %p", (href) => {
    expect(safePostLinkHref(href)).toBeNull()
  })

  test("refuses an href that is not a string at all", () => {
    expect(safePostLinkHref(undefined)).toBeNull()
    expect(safePostLinkHref({ toString: () => "https://example.org" })).toBeNull()
  })
})
