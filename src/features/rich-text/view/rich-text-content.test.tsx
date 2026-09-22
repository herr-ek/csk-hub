import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { RichTextDocument } from "../document"
import { renderRichText } from "./rich-text-content"
import {
  blockquote,
  bold,
  bulletList,
  doc,
  heading,
  horizontalRule,
  italic,
  link,
  listItem,
  orderedList,
  paragraph,
  spannedCell,
  table,
  tableOf,
  text
} from "./test-fixtures"

/** What a reader's browser actually receives for a stored document. */
function render(document: RichTextDocument): string {
  return renderToStaticMarkup(renderRichText(document))
}

describe("rendering a document", () => {
  test.each([
    ["a heading", doc(heading(2, text("Rehearsals"))), "<h2>Rehearsals</h2>"],
    ["a subheading", doc(heading(3, text("Tenors"))), "<h3>Tenors</h3>"],
    ["bold", doc(paragraph(text("the folder", bold))), "<strong>the folder</strong>"],
    ["italic", doc(paragraph(text("on", italic))), "<em>on</em>"],
    ["a bullet list", doc(bulletList(listItem(paragraph(text("One"))))), "<ul><li><p>One</p></li></ul>"],
    ["an ordered list", doc(orderedList(listItem(paragraph(text("One"))))), "<ol><li><p>One</p></li></ol>"],
    ["a blockquote", doc(blockquote(paragraph(text("Sing out.")))), "<blockquote><p>Sing out.</p></blockquote>"],
    ["a divider", doc(horizontalRule()), "<hr/>"],
    ["a table header", doc(table(["A"], ["1"])), '<th scope="col"><p>A</p></th>']
  ])("draws %s", (_what, document, expected) => {
    expect(render(document)).toContain(expected)
  })

  test("draws a link as plain words where the surface is itself a link", () => {
    const document = doc(paragraph(text("the rota", link("https://example.org/rota"))))

    // A feed card links to the Post, and a browser will not nest one anchor in another.
    expect(renderToStaticMarkup(renderRichText(document, { linksAsText: true }))).toBe("<p>the rota</p>")
  })

  test("gives a link its destination and holds it at arm's length", () => {
    const html = render(doc(paragraph(text("the rota", link("https://example.org/rota")))))

    expect(html).toContain('href="https://example.org/rota"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  test("gives a table one column per header cell, as the editor does", () => {
    const html = render(doc(table(["Week", "Choir"], ["36", "MK"])))

    expect(html).toContain("<colgroup><col/><col/></colgroup>")
    // A cell that spans only itself says so by saying nothing.
    expect(html.toLowerCase()).not.toContain("colspan")
    expect(html.toLowerCase()).not.toContain("rowspan")
  })

  test("keeps the spans and widths a merged or resized table carries", () => {
    const html = render(
      doc(
        tableOf([
          spannedCell("tableHeader", "Week", { colspan: 2, colwidth: [120, 80] }),
          spannedCell("tableHeader", "Choir", { rowspan: 2 })
        ])
      )
    )

    // A merged cell covers each of its columns in the colgroup too; count the cells
    // instead and the reader's table stops lining up with the editor's.
    expect(html).toContain('<col style="width:120px"/><col style="width:80px"/><col/>')
    // Lowercased first: React spells these `colSpan`/`rowSpan` in its output, which a
    // browser reads as the same attribute because HTML attribute names are case-insensitive.
    expect(html.toLowerCase()).toContain('colspan="2"')
    expect(html.toLowerCase()).toContain('rowspan="2"')
  })
})

describe("what a reader is protected from", () => {
  test("text that looks like markup stays text", () => {
    const html = render(doc(paragraph(text('<script>alert(1)</script> <img src="x" onerror="alert(1)">'))))

    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&lt;img")
  })

  test("a javascript: link in a stored row keeps its words and loses its destination", () => {
    const html = render(doc(paragraph(text("Click me", link("javascript:alert(1)")))))

    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("<a ")
    expect(html).toContain("Click me")
  })

  test("a heading level outside h1–h6 in a stored row still renders as a heading", () => {
    expect(render(doc(heading(0, text("Low"))))).toBe("<h1>Low</h1>")
    expect(render(doc(heading(9, text("High"))))).toBe("<h6>High</h6>")
  })

  test("a node the view does not know loses its markup but keeps its words", () => {
    const html = render(doc({ type: "iframe", content: [text("not a known node")] }))

    expect(html).not.toContain("iframe")
    expect(html).toContain("not a known node")
  })
})
