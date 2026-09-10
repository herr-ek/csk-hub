import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { parsePostMarkdown } from "./markdown"
import { renderPostBody } from "./post-content"

/** What a Member's browser actually receives for a given stored body. */
function render(markdown: string): string {
  return renderToStaticMarkup(renderPostBody(parsePostMarkdown(markdown)))
}

describe("rendering a Post body", () => {
  test.each([
    ["## Rehearsals", "<h2>Rehearsals</h2>"],
    ["### Tenors", "<h3>Tenors</h3>"],
    ["Bring **the folder**.", "<strong>the folder</strong>"],
    ["The concert is *on*.", "<em>on</em>"],
    ["- One\n- Two", "<ul>"],
    ["1. One\n2. Two", "<ol>"],
    ["> Sing out.", "<blockquote>"],
    ["---", "<hr/>"],
    ["| A | B |\n| --- | --- |\n| 1 | 2 |", '<th scope="col">']
  ])("renders %p as markup", (markdown, expected) => {
    expect(render(markdown)).toContain(expected)
  })

  test("gives a link its destination and holds it at arm's length", () => {
    const html = render("See [the rota](https://example.org/rota).")

    expect(html).toContain('href="https://example.org/rota"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })
})

describe("what a reader is protected from", () => {
  test("markup pasted from another document arrives as text, not as elements", () => {
    const html = render("<script>alert(1)</script>")

    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  test("an event handler pasted in an inline tag is likewise only text", () => {
    const html = render('Look <img src="x" onerror="alert(1)"> here')

    expect(html).not.toContain("<img")
    expect(html).toContain("onerror")
    expect(html).toContain("&lt;img")
  })

  test("a javascript: link keeps its words and loses its destination", () => {
    const html = render("[Click me](javascript:alert(1))")

    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("<a ")
    expect(html).toContain("Click me")
  })

  test("a body heading never renders as h1, which belongs to the Post title", () => {
    expect(render("# A second title")).toBe("<h2>A second title</h2>")
  })

  test("a node outside the enabled set loses its markup but keeps its words", () => {
    const html = renderToStaticMarkup(
      renderPostBody({
        type: "doc",
        content: [{ type: "iframe", content: [{ type: "text", text: "not a Post node" }] }]
      })
    )

    expect(html).not.toContain("iframe")
    expect(html).toContain("not a Post node")
  })
})
