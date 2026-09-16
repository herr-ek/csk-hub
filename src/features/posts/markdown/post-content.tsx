import "server-only"

import type { JSONContent } from "@tiptap/core"
import { renderJSONContentToReactElement } from "@tiptap/static-renderer/json/react"
import { Fragment, type ReactNode } from "react"
import { POST_HEADING_LEVELS } from "./extensions"
import { parsePostMarkdown, safePostLinkHref } from "./markdown"
import { PostProse } from "./post-prose"

const [, SUBSECTION_HEADING_LEVEL] = POST_HEADING_LEVELS

/**
 * How many columns a table has; Markdown gives every row the header row's width. Typed
 * on the shape it reads because the renderer's nodes have readonly `marks`, which
 * `JSONContent` does not accept.
 */
function columnCount(table: { content?: readonly { content?: readonly unknown[] }[] }): number {
  return table.content?.[0]?.content?.length ?? 0
}

/**
 * Render the stored document to React elements. The mapping is the read path's
 * allowlist: a node or mark with no entry produces no markup, and nothing is handed to
 * `dangerouslySetInnerHTML`, so text that looks like markup stays text.
 */
const renderPostDocument = renderJSONContentToReactElement({
  nodeMapping: {
    doc: ({ children }) => <Fragment>{children}</Fragment>,
    paragraph: ({ children }) => <p>{children}</p>,
    text: ({ node }) => node.text ?? null,
    hardBreak: () => <br />,
    // Clamped again here so no route into the renderer can emit a heading outside the enabled set.
    heading: ({ node, children }) =>
      Number(node.attrs?.level) >= SUBSECTION_HEADING_LEVEL ? <h3>{children}</h3> : <h2>{children}</h2>,
    bulletList: ({ children }) => <ul>{children}</ul>,
    orderedList: ({ children }) => <ol>{children}</ol>,
    listItem: ({ children }) => <li>{children}</li>,
    blockquote: ({ children }) => <blockquote>{children}</blockquote>,
    horizontalRule: () => <hr />,
    // A Markdown table is a header row plus body rows, so one tbody is enough. The
    // colgroup matches the editor's, which lays the columns out differently without it.
    table: ({ node, children }) => (
      <div className="post-prose-table-scroll">
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
  },
  markMapping: {
    bold: ({ children }) => <strong>{children}</strong>,
    italic: ({ children }) => <em>{children}</em>,
    link: ({ mark, children }) => {
      const href = safePostLinkHref(mark.attrs?.href)
      // Drop the unsafe destination, keep the words it was wrapped around.
      if (!href) return <Fragment>{children}</Fragment>
      return (
        <a href={href} rel="noopener noreferrer nofollow" target="_blank">
          {children}
        </a>
      )
    }
  },
  // Unknown nodes lose their markup but keep their words: better unstyled than swallowed.
  unhandledNode: ({ children }) => <Fragment>{children}</Fragment>,
  unhandledMark: ({ children }) => <Fragment>{children}</Fragment>
})

/** The rendered body of a Post, for callers that already hold a document. */
export function renderPostBody(document: JSONContent): ReactNode {
  return renderPostDocument({ content: document })
}

/**
 * A published Post's body, rendered from its stored Markdown on the server, so no part
 * of the editor reaches a reader.
 */
export function PostContent({ markdown, className }: { markdown: string; className?: string }) {
  return <PostProse className={className}>{renderPostBody(parsePostMarkdown(markdown))}</PostProse>
}
