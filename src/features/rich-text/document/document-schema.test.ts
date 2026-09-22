import { describe, expect, test } from "bun:test"
import { createDocumentSchema } from "./document-schema"
import { richText } from "./features"

const schema = createDocumentSchema([
  richText.headings([2, 3]),
  richText.emphasis,
  richText.links,
  richText.lists,
  richText.blockquotes,
  richText.dividers,
  richText.tables
])

const text = (value: string, marks?: object[]) =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value }
const paragraph = (...content: object[]) => ({ type: "paragraph", content })
const doc = (...content: object[]) => ({ type: "doc", content })

describe("createDocumentSchema", () => {
  test("reads the heading levels off the configured extension", () => {
    expect(schema.headingLevels).toEqual([2, 3])
    expect(createDocumentSchema([richText.emphasis]).headingLevels).toEqual([])
  })
})

describe("normalizing a document", () => {
  test("hands a document the editor produced back unchanged", () => {
    const written = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Rehearsal")] },
      paragraph(text("Bring the "), text("folder", [{ type: "bold" }]), text(".")),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("Tenors"))] }] },
      { type: "horizontalRule" }
    )

    expect(schema.normalize(written)).toEqual(written)
  })

  test("drops a node the schema does not know and keeps its words", () => {
    const pasted = doc({
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [text("const a = 1")]
    })

    // A code block's text lands in the body, where the schema wants a block; so the
    // document is refused rather than repaired, because the editor could not have made it.
    expect(schema.normalize(pasted)).toBeNull()

    const wrapped = doc(paragraph({ type: "mention", content: [text("Alice")] }, text(" sings.")))
    // The freed words join the text around them, as the schema would have written them.
    expect(schema.normalize(wrapped)).toEqual(doc(paragraph(text("Alice sings."))))
  })

  test("drops a hard break, which is an editing gesture rather than a node", () => {
    const written = doc(paragraph(text("Doors 19:00"), { type: "hardBreak" }, text("Curtain 19:30")))

    // Shift+Enter would otherwise store a `<br>`, widening the vocabulary past the
    // nodes a consumer opted in to; the words either side of it survive.
    expect(schema.normalize(written)).toEqual(doc(paragraph(text("Doors 19:00Curtain 19:30"))))
  })

  test("drops a mark the schema does not know and keeps its words", () => {
    const pasted = doc(paragraph(text("loud", [{ type: "underline" }, { type: "bold" }])))

    expect(schema.normalize(pasted)).toEqual(doc(paragraph(text("loud", [{ type: "bold" }]))))
  })

  test("drops attributes the node does not declare", () => {
    const pasted = doc({ type: "paragraph", attrs: { style: "color: red" }, content: [text("Hi")] })

    expect(schema.normalize(pasted)).toEqual(doc(paragraph(text("Hi"))))
  })

  test("moves a heading outside the allowed levels to the nearest one", () => {
    const h1 = doc({ type: "heading", attrs: { level: 1 }, content: [text("Title")] })
    const h6 = doc({ type: "heading", attrs: { level: 6 }, content: [text("Small")] })
    const nonsense = doc({ type: "heading", attrs: { level: "big" }, content: [text("?")] })

    expect(schema.normalize(h1)?.content?.[0]?.attrs).toEqual({ level: 2 })
    expect(schema.normalize(h6)?.content?.[0]?.attrs).toEqual({ level: 3 })
    expect(schema.normalize(nonsense)?.content?.[0]?.attrs).toEqual({ level: 2 })
  })

  test("keeps the words of a link that points somewhere unsafe, without the link", () => {
    const pasted = doc(paragraph(text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))

    expect(schema.normalize(pasted)).toEqual(doc(paragraph(text("click"))))
  })

  test("keeps a link that points somewhere safe, with only the attributes a link has", () => {
    const pasted = doc(
      paragraph(text("site", [{ type: "link", attrs: { href: "https://csk.se", onclick: "steal()" } }]))
    )

    const marks = schema.normalize(pasted)?.content?.[0]?.content?.[0]?.marks
    expect(marks).toHaveLength(1)
    expect(marks?.[0]?.type).toBe("link")
    expect(marks?.[0]?.attrs?.href).toBe("https://csk.se")
    expect(marks?.[0]?.attrs).not.toHaveProperty("onclick")
  })

  test("refuses a shape the schema forbids rather than repairing it", () => {
    const loose = doc({ type: "listItem", content: [paragraph(text("Alone"))] })
    const inlineAtTop = doc(text("Just words"))

    expect(schema.normalize(loose)).toBeNull()
    expect(schema.normalize(inlineAtTop)).toBeNull()
  })

  test("refuses a document with nothing to read", () => {
    expect(schema.normalize(doc(paragraph()))).toBeNull()
    expect(schema.normalize(doc(paragraph(text("   "))))).toBeNull()
    expect(schema.normalize(doc({ type: "horizontalRule" }))).toBeNull()
    expect(schema.normalize(doc())).toBeNull()
    expect(schema.normalize({})).toBeNull()
    expect(schema.normalize("<p>hi</p>")).toBeNull()
    expect(schema.normalize(null)).toBeNull()
  })

  test("parses the JSON a form submits and refuses what is not JSON", () => {
    const written = doc(paragraph(text("Hi")))

    expect(schema.parse(JSON.stringify(written))).toEqual(written)
    expect(schema.parse("")).toBeNull()
    expect(schema.parse("not json")).toBeNull()
    expect(schema.parse("Plain text from the old textarea")).toBeNull()
  })

  test("a smaller schema drops what a larger one keeps", () => {
    const plain = createDocumentSchema([richText.emphasis])
    const written = doc({ type: "heading", attrs: { level: 2 }, content: [text("Rehearsal")] })

    // The heading's text is inline, and the body wants blocks: refused, not demoted.
    expect(plain.normalize(written)).toBeNull()
    expect(plain.normalize(doc(paragraph(text("fine", [{ type: "bold" }]))))).toEqual(
      doc(paragraph(text("fine", [{ type: "bold" }])))
    )
  })
})
