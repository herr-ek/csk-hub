import type { RichTextDocument } from "../document"

/** Small builders for the documents the view tests render. */
export const text = (value: string, ...marks: { type: string; attrs?: object }[]): RichTextDocument =>
  marks.length > 0 ? { type: "text", text: value, marks } : { type: "text", text: value }
export const paragraph = (...content: RichTextDocument[]): RichTextDocument => ({ type: "paragraph", content })
export const heading = (level: number, ...content: RichTextDocument[]): RichTextDocument => ({
  type: "heading",
  attrs: { level },
  content
})
export const listItem = (...content: RichTextDocument[]): RichTextDocument => ({ type: "listItem", content })
export const bulletList = (...items: RichTextDocument[]): RichTextDocument => ({ type: "bulletList", content: items })
export const orderedList = (...items: RichTextDocument[]): RichTextDocument => ({
  type: "orderedList",
  content: items
})
export const blockquote = (...content: RichTextDocument[]): RichTextDocument => ({ type: "blockquote", content })
export const horizontalRule = (): RichTextDocument => ({ type: "horizontalRule" })
export const link = (href: string) => ({ type: "link", attrs: { href } })
export const bold = { type: "bold" }
export const italic = { type: "italic" }

const cell = (type: "tableHeader" | "tableCell", value: string): RichTextDocument => ({
  type,
  content: [paragraph(text(value))]
})
export const table = (header: string[], ...rows: string[][]): RichTextDocument => ({
  type: "table",
  content: [
    { type: "tableRow", content: header.map((value) => cell("tableHeader", value)) },
    ...rows.map((row) => ({ type: "tableRow", content: row.map((value) => cell("tableCell", value)) }))
  ]
})
export const doc = (...content: RichTextDocument[]): RichTextDocument => ({ type: "doc", content })
