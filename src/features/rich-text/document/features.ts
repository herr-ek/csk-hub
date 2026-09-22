import type { Extensions } from "@tiptap/core"
import { Blockquote } from "@tiptap/extension-blockquote"
import { Bold } from "@tiptap/extension-bold"
import { Document } from "@tiptap/extension-document"
import { Heading, type Level } from "@tiptap/extension-heading"
import { HorizontalRule } from "@tiptap/extension-horizontal-rule"
import { Italic } from "@tiptap/extension-italic"
import { Link } from "@tiptap/extension-link"
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { Text } from "@tiptap/extension-text"
import { safeLinkHref } from "./safe-link-href"

/** A heading level a consumer may allow. Tiptap has no heading outside h1–h6. */
export type HeadingLevel = Level

/** What every document is made of, whatever else a consumer allows. */
export const baseFeatures: Extensions = [Document, Paragraph, Text]

/**
 * What a document may contain, grouped the way a consumer opts in: by capability rather
 * than by Tiptap package, so a consumer never learns that a table is four extensions.
 * A group added here needs a matching entry in the view's node mapping and, if it is
 * hard to type, a toolbar control.
 */
export const richText = {
  headings: (levels: readonly HeadingLevel[]): Extensions => [Heading.configure({ levels: [...levels] })],
  emphasis: [Bold, Italic] as Extensions,
  links: [
    Link.configure({
      openOnClick: false,
      // The editor's rule and the stored document's rule are one predicate, not two
      // lists kept in step. `protocols` only *adds* to Tiptap's defaults, so configuring
      // it would still let `ftp:` or `tel:` autolink while typing and then vanish when
      // the normaliser applied `safeLinkHref` on the way into the column.
      isAllowedUri: (url) => safeLinkHref(url) !== null,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" }
    })
  ] as Extensions,
  lists: [BulletList, OrderedList, ListItem] as Extensions,
  blockquotes: [Blockquote] as Extensions,
  dividers: [HorizontalRule] as Extensions,
  tables: [Table, TableRow, TableHeader, TableCell] as Extensions
}
