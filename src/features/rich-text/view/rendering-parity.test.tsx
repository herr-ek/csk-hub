import { describe, expect, test } from "bun:test"
import { getSchema } from "@tiptap/core"
import { Node } from "@tiptap/pm/model"
import { renderToStaticMarkup } from "react-dom/server"
import { createDocumentSchema, type RichTextDocument, richText } from "../document"
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
  table,
  text
} from "./test-fixtures"

/**
 * A reader must be unable to tell the editor's rendering of a document from the
 * server's, which holds only while both hand the prose stylesheet the same elements.
 * These tests compare the two for the same document, across every feature the module
 * offers.
 */
const everything = createDocumentSchema([
  richText.headings([2, 3]),
  richText.emphasis,
  richText.links,
  richText.lists,
  richText.blockquotes,
  richText.dividers,
  richText.tables
])
const schema = getSchema(everything.extensions)

/** The server's scroll box around a table — the only element either side may hold alone. */
const SCROLL_WRAPPER = "div"

/** Every tag name in a ProseMirror DOM output spec, holes and attributes skipped. */
function tagsInOutputSpec(spec: unknown, found: Set<string>): void {
  if (!Array.isArray(spec)) return

  const [tag, ...rest] = spec
  if (typeof tag === "string") found.add(tag)
  for (const part of rest) tagsInOutputSpec(part, found)
}

/** What the editor puts on screen for this document. */
function editorTags(document: RichTextDocument): string[] {
  const node = Node.fromJSON(schema, document)
  const found = new Set<string>()

  node.descendants((child) => {
    tagsInOutputSpec(child.type.spec.toDOM?.(child), found)
    for (const mark of child.marks) tagsInOutputSpec(mark.type.spec.toDOM?.(mark, true), found)
    return true
  })

  return [...found].sort()
}

/** What the server puts on screen for the same document. */
function serverTags(document: RichTextDocument): string[] {
  const html = renderToStaticMarkup(renderRichText(document))
  const found = new Set([...html.matchAll(/<([a-z][a-z0-9]*)/g)].map(([, tag]) => tag))

  found.delete(SCROLL_WRAPPER)
  return [...found].sort()
}

describe("the editor and the stored document are made of the same elements", () => {
  test.each([
    ["h2", doc(heading(2, text("Rehearsals in October")))],
    ["h3", doc(heading(3, text("Tenors and basses")))],
    ["bold", doc(paragraph(text("Bring "), text("the black folder", bold), text(".")))],
    ["italic", doc(paragraph(text("The concert is "), text("not", italic), text(" cancelled.")))],
    ["bullet list", doc(bulletList(listItem(paragraph(text("Black folder"))), listItem(paragraph(text("Water")))))],
    ["ordered list", doc(orderedList(listItem(paragraph(text("Warm up"))), listItem(paragraph(text("Brahms")))))],
    ["link", doc(paragraph(text("The rota is "), text("on the noticeboard", link("https://example.org/rota"))))],
    ["blockquote", doc(blockquote(paragraph(text("Sing it like you mean it."))))],
    ["horizontal rule", doc(paragraph(text("Before.")), horizontalRule(), paragraph(text("After.")))],
    ["table", doc(table(["Week", "Choir"], ["36", "MK"]))]
  ])("%s", (_feature, document) => {
    expect(serverTags(document)).toEqual(editorTags(document))
  })

  test("a whole document, with every feature at once", () => {
    const document = doc(
      heading(2, text("Klokstäd")),
      paragraph(
        text("The "),
        text("autumn", bold),
        text(" rota is below — tell "),
        text("the board", link("mailto:styrelsen@example.org")),
        text(" if you cannot make it.")
      ),
      heading(3, text("What to bring")),
      bulletList(listItem(paragraph(text("Rubber gloves"))), listItem(paragraph(text("Good spirits")))),
      orderedList(listItem(paragraph(text("Sign up"))), listItem(paragraph(text("Turn up")))),
      blockquote(paragraph(text("Nobody leaves before the floor is done."))),
      horizontalRule(),
      table(["Week", "Choir"], ["36", "MK"])
    )

    expect(serverTags(document)).toEqual(editorTags(document))
  })
})
