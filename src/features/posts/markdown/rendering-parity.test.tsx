import { describe, expect, test } from "bun:test"
import { getSchema } from "@tiptap/core"
import { Node } from "@tiptap/pm/model"
import { renderToStaticMarkup } from "react-dom/server"
import { postBodyExtensions } from "./extensions"
import { parsePostMarkdown } from "./markdown"
import { renderPostBody } from "./post-content"

/**
 * A Post is rendered twice — by the editor while an Admin writes it, and by the server
 * once it is published — and ADR-0004 requires a reader to be unable to tell which one
 * they are looking at. One prose stylesheet is half of that; the other half is that
 * both surfaces hand that stylesheet the same elements to style.
 *
 * These tests compare the elements the editor's own schema produces with the elements
 * the server renderer produces, so a change to either side that breaks the likeness
 * fails here rather than in front of a Member.
 */
const schema = getSchema(postBodyExtensions)

/**
 * The server renderer wraps a table so a wide rota can scroll on a phone instead of
 * widening the page. It is a layout box around the table, not a change to the table,
 * and the editor has no equivalent — the only element either side may hold alone.
 */
const SCROLL_WRAPPER = "div"

/** Every tag name in a ProseMirror DOM output spec, holes and attributes skipped. */
function tagsInOutputSpec(spec: unknown, found: Set<string>): void {
  if (!Array.isArray(spec)) return

  const [tag, ...rest] = spec
  if (typeof tag === "string") found.add(tag)
  for (const part of rest) tagsInOutputSpec(part, found)
}

/** What the editor puts on screen for this Markdown. */
function editorTags(markdown: string): Set<string> {
  const document = Node.fromJSON(schema, parsePostMarkdown(markdown))
  const found = new Set<string>()

  document.descendants((node) => {
    tagsInOutputSpec(node.type.spec.toDOM?.(node), found)
    for (const mark of node.marks) tagsInOutputSpec(mark.type.spec.toDOM?.(mark, true), found)
    return true
  })

  return found
}

/** What the server puts on screen for the same Markdown. */
function serverTags(markdown: string): Set<string> {
  const html = renderToStaticMarkup(renderPostBody(parsePostMarkdown(markdown)))
  const found = new Set([...html.matchAll(/<([a-z][a-z0-9]*)/g)].map(([, tag]) => tag))

  found.delete(SCROLL_WRAPPER)
  return found
}

function sorted(tags: Set<string>): string[] {
  return [...tags].sort()
}

describe("the editor and the published Post are made of the same elements", () => {
  test.each([
    ["h2", "## Rehearsals in October"],
    ["h3", "### Tenors and basses"],
    ["bold", "Bring **the black folder**."],
    ["italic", "The concert is *not* cancelled."],
    ["bullet list", "- Black folder\n- Water bottle"],
    ["ordered list", "1. Warm up\n2. Run the Brahms"],
    ["link", "The rota is [on the noticeboard](https://example.org/rota)."],
    ["blockquote", "> Sing it like you mean it."],
    ["horizontal rule", "Before.\n\n---\n\nAfter."],
    ["table", "| Week | Choir |\n| --- | --- |\n| 36 | MK |"]
  ])("%s", (_node, markdown) => {
    expect(sorted(serverTags(markdown))).toEqual(sorted(editorTags(markdown)))
  })

  test("a whole Post, with every node at once", () => {
    const markdown = [
      "## Klokstäd",
      "",
      "The **autumn** rota is below — tell [the board](mailto:styrelsen@example.org) if you cannot make it.",
      "",
      "### What to bring",
      "",
      "- Rubber gloves",
      "- Good spirits",
      "",
      "1. Sign up",
      "2. Turn up",
      "",
      "> Nobody leaves before the floor is done.",
      "",
      "---",
      "",
      "| Week | Choir |",
      "| --- | --- |",
      "| 36 | MK |"
    ].join("\n")

    expect(sorted(serverTags(markdown))).toEqual(sorted(editorTags(markdown)))
  })
})
