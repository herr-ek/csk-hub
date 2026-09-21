import "server-only"

import { renderJSONContentToReactElement } from "@tiptap/static-renderer/json/react"
import { createElement, Fragment, type ReactNode } from "react"
import { type RichTextDocument, safeLinkHref } from "../document"
import { RichTextProse } from "./rich-text-prose"

type RenderOptions = Parameters<typeof renderJSONContentToReactElement>[0]

/**
 * How many columns a table has. Typed on the shape it reads because the renderer's
 * nodes carry readonly `marks`, which `JSONContent` does not accept.
 */
function columnCount(table: { content?: readonly { content?: readonly unknown[] }[] }): number {
  return table.content?.[0]?.content?.length ?? 0
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
  hardBreak: () => <br />,
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
          {Array.from({ length: columnCount(node) }, (_, column) => (
            <col key={column} />
          ))}
        </colgroup>
        <tbody>{children}</tbody>
      </table>
    </div>
  ),
  tableRow: ({ children }) => <tr>{children}</tr>,
  tableHeader: ({ children }) => <th scope="col">{children}</th>,
  tableCell: ({ children }) => <td>{children}</td>
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

const renderDocument = renderJSONContentToReactElement({
  nodeMapping,
  markMapping,
  // Unknown nodes lose their markup but keep their words: better unstyled than swallowed.
  unhandledNode: ({ children }) => <Fragment>{children}</Fragment>,
  unhandledMark: ({ children }) => <Fragment>{children}</Fragment>
})

/** The rendered body of a document, for callers that place it in their own surface. */
export function renderRichText(document: RichTextDocument): ReactNode {
  return renderDocument({ content: document })
}

/** A stored document, rendered on the server so no part of the editor reaches a reader. */
export function RichTextContent({ document, className }: { document: RichTextDocument; className?: string }) {
  return <RichTextProse className={className}>{renderRichText(document)}</RichTextProse>
}
