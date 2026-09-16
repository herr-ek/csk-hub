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

/** The heading levels a Post body may contain; h1 belongs to the Post title. */
export const POST_HEADING_LEVELS = [2, 3] as const

/** The URL schemes a Post link may point at. */
export const SAFE_LINK_PROTOCOLS = ["http", "https", "mailto"]

/**
 * The nodes and marks a Post body may contain, read by the parser, the editor and the
 * server renderer alike. A node absent here has no stored Markdown form, so adding one
 * is a decision about the storage format.
 */
export const postBodyExtensions = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [...POST_HEADING_LEVELS] }),
  Bold,
  Italic,
  BulletList,
  OrderedList,
  ListItem,
  Link.configure({
    openOnClick: false,
    protocols: SAFE_LINK_PROTOCOLS,
    HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" }
  }),
  Blockquote,
  HorizontalRule,
  HardBreak,
  Table,
  TableRow,
  TableHeader,
  TableCell
]
