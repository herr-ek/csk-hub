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

/**
 * The heading levels a Post body may contain. h1 belongs to the Post title, so the
 * body starts at h2 — a body h1 would compete with the title for the document
 * outline and read as a second title.
 */
export const POST_HEADING_LEVELS = [2, 3] as const

/** The URL schemes a Post link may point at. Everything else is not a destination. */
export const SAFE_LINK_PROTOCOLS = ["http", "https", "mailto"]

/**
 * The set of nodes and marks a Post body may contain — the single source of truth
 * behind ADR-0004's round-trip obligation. This list is not an editor preference:
 * a node absent from it has no Markdown representation this project can store, so
 * adding one is a decision about the storage format.
 *
 * The Markdown parser, the editor and the server-side renderer all read this list,
 * which is what keeps the two render paths from drifting apart.
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
