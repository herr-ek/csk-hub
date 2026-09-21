import type { Extensions } from "@tiptap/core"
import { Blockquote } from "@tiptap/extension-blockquote"
import { Bold } from "@tiptap/extension-bold"
import { Document } from "@tiptap/extension-document"
import { HardBreak } from "@tiptap/extension-hard-break"
import { Heading } from "@tiptap/extension-heading"
import { HorizontalRule } from "@tiptap/extension-horizontal-rule"
import { Italic } from "@tiptap/extension-italic"
import { Link } from "@tiptap/extension-link"
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { Text } from "@tiptap/extension-text"

/** The URL schemes a link may point at; `safeLinkHref` enforces the same list on stored documents. */
export const SAFE_LINK_PROTOCOLS = ["http", "https", "mailto"]

/** What every document is made of, whatever else a consumer allows. */
export const baseFeatures: Extensions = [Document, Paragraph, Text, HardBreak]

/**
 * What a document may contain, grouped the way a consumer opts in: by capability rather
 * than by Tiptap package, so a consumer never learns that a table is four extensions.
 * A group added here needs a matching entry in the view's node mapping and, if it is
 * hard to type, a toolbar control.
 */
export const richText = {
  headings: (levels: readonly number[]): Extensions => [Heading.configure({ levels: [...levels] })],
  emphasis: [Bold, Italic] as Extensions,
  links: [
    Link.configure({
      openOnClick: false,
      protocols: SAFE_LINK_PROTOCOLS,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" }
    })
  ] as Extensions,
  lists: [BulletList, OrderedList, ListItem] as Extensions,
  blockquotes: [Blockquote] as Extensions,
  dividers: [HorizontalRule] as Extensions,
  tables: [Table, TableRow, TableHeader, TableCell] as Extensions
}
