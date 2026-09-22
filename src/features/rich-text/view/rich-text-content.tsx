import "server-only"

import {
  type JSONMarkType,
  type JSONNodeType,
  renderJSONContentToReactElement,
  type TiptapStaticRendererOptions
} from "@tiptap/static-renderer/json/react"
import { createElement, Fragment, type ReactNode } from "react"
import { type RichTextDocument, safeLinkHref } from "../document"
import { RichTextProse } from "./rich-text-prose"

// Spelled out rather than read off `renderJSONContentToReactElement`: that function's
// node and mark types are generic, so `Parameters<…>` yields their bare constraints
// instead of the JSON shapes the mappings are actually handed.
type RenderOptions = TiptapStaticRendererOptions<ReactNode, JSONMarkType, JSONNodeType>

/** A `colspan` or `rowspan` as a positive whole number, however a row came to hold one. */
function cellSpan(value: unknown): number {
  const span = Number(value)
  return Number.isInteger(span) && span > 0 ? span : 1
}

/** The spans a cell carries, left off the element entirely when it spans only itself. */
function cellSpans(attrs: JSONNodeType["attrs"]): { colSpan?: number; rowSpan?: number } {
  const colSpan = cellSpan(attrs?.colspan)
  const rowSpan = cellSpan(attrs?.rowspan)

  return { colSpan: colSpan > 1 ? colSpan : undefined, rowSpan: rowSpan > 1 ? rowSpan : undefined }
}

/**
 * The columns of a table, the way the editor's own table view lays them out: one `<col>`
 * per column a cell covers — so a merged cell counts for all of them — carrying the
 * stored width where the author has dragged a column.
 */
function tableColumns(table: JSONNodeType): (number | undefined)[] {
  const columns: (number | undefined)[] = []

  for (const cell of table.content?.[0]?.content ?? []) {
    const stored = cell.attrs?.colwidth
    for (let index = 0; index < cellSpan(cell.attrs?.colspan); index += 1) {
      const width = Array.isArray(stored) ? Number(stored[index]) : Number.NaN
      columns.push(Number.isFinite(width) && width > 0 ? width : undefined)
    }
  }

  return columns
}

/** An h1–h6 for a stored level, however a row came to hold one outside that range. */
function headingTag(level: unknown): string {
  const parsed = Number(level)
  return `h${Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 6) : 1}`
}

/**
 * How each node the module supports is drawn. The mapping is an allowlist, not a
 * fallback: a node with no entry keeps its words and loses its markup, and nothing is
 * handed to `dangerouslySetInnerHTML`, so text that looks like markup stays text.
 */
const nodeMapping = {
  doc: ({ children }) => <Fragment>{children}</Fragment>,
  paragraph: ({ children }) => <p>{children}</p>,
  text: ({ node }) => node.text ?? null,
  heading: ({ node, children }) => createElement(headingTag(node.attrs?.level), null, children),
  bulletList: ({ children }) => <ul>{children}</ul>,
  orderedList: ({ children }) => <ol>{children}</ol>,
  listItem: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  horizontalRule: () => <hr />,
  // The colgroup matches the editor's, which lays the columns out differently without it.
  table: ({ node, children }) => (
    <div className="rich-text-table-scroll">
      <table>
        <colgroup>
          {tableColumns(node).map((width, column) => (
            <col key={column} style={width === undefined ? undefined : { width: `${width}px` }} />
          ))}
        </colgroup>
        <tbody>{children}</tbody>
      </table>
    </div>
  ),
  tableRow: ({ children }) => <tr>{children}</tr>,
  tableHeader: ({ node, children }) => (
    <th scope="col" {...cellSpans(node.attrs)}>
      {children}
    </th>
  ),
  tableCell: ({ node, children }) => <td {...cellSpans(node.attrs)}>{children}</td>
} satisfies RenderOptions["nodeMapping"]

/** How each mark the module supports is drawn, on the same allowlist terms as the nodes. */
const markMapping = {
  bold: ({ children }) => <strong>{children}</strong>,
  italic: ({ children }) => <em>{children}</em>,
  link: ({ mark, children }) => {
    const href = safeLinkHref(mark.attrs?.href)
    // Drop the unsafe destination, keep the words it was wrapped around.
    if (!href) return <Fragment>{children}</Fragment>
    return (
      <a href={href} rel="noopener noreferrer nofollow" target="_blank">
        {children}
      </a>
    )
  }
} satisfies RenderOptions["markMapping"]

// Unknown nodes and marks lose their markup but keep their words: better unstyled than
// swallowed.
const unhandled = { unhandledNode: ({ children }) => <Fragment>{children}</Fragment> } satisfies Pick<
  RenderOptions,
  "unhandledNode"
>

const renderDocument = renderJSONContentToReactElement({
  nodeMapping,
  markMapping,
  ...unhandled,
  unhandledMark: ({ children }) => <Fragment>{children}</Fragment>
})

/**
 * The same document with its links reduced to the words they wrapped. A card that is
 * itself a link to the Post cannot hold an `<a>`: the parser closes the outer anchor
 * rather than nesting it, leaving markup neither renderer wrote.
 */
const renderDocumentWithoutLinks = renderJSONContentToReactElement({
  nodeMapping,
  markMapping: { ...markMapping, link: ({ children }) => <Fragment>{children}</Fragment> },
  ...unhandled,
  unhandledMark: ({ children }) => <Fragment>{children}</Fragment>
})

type ReadingOptions = {
  /** Draw links as plain words. For a surface that is itself a link, and nothing else. */
  linksAsText?: boolean
}

/** The rendered body of a document, for callers that place it in their own surface. */
export function renderRichText(document: RichTextDocument, { linksAsText }: ReadingOptions = {}): ReactNode {
  return linksAsText ? renderDocumentWithoutLinks({ content: document }) : renderDocument({ content: document })
}

/** A stored document, rendered on the server so no part of the editor reaches a reader. */
export function RichTextContent({
  document,
  className,
  linksAsText
}: { document: RichTextDocument; className?: string } & ReadingOptions) {
  return <RichTextProse className={className}>{renderRichText(document, { linksAsText })}</RichTextProse>
}
