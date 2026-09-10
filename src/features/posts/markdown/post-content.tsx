import "server-only"

import type { JSONContent } from "@tiptap/core"
import { renderJSONContentToReactElement } from "@tiptap/static-renderer/json/react"
import { Fragment, type ReactNode } from "react"
import { POST_HEADING_LEVELS } from "./extensions"
import { parsePostMarkdown, safePostLinkHref } from "./markdown"
import { PostProse } from "./post-prose"

const [, SUBSECTION_HEADING_LEVEL] = POST_HEADING_LEVELS

/**
 * How many columns a table has. Markdown gives every row the same width and no merged
 * cells, so the header row answers for the whole table.
 *
 * Typed on the shape it reads rather than on `JSONContent`: the renderer hands its
 * mapping a node whose `marks` are readonly, which `JSONContent` does not accept.
 */
function columnCount(table: { content?: readonly { content?: readonly unknown[] }[] }): number {
  return table.content?.[0]?.content?.length ?? 0
}

/**
 * Render the stored document to React elements — not to an HTML string.
 *
 * The mapping below is the read path's allowlist. A node or mark with no entry here
 * produces no markup at all, which means nothing outside the enabled set can reach a
 * reader's browser as markup even if it somehow reached the database. Nothing is ever
 * handed to `dangerouslySetInnerHTML`, so text that looks like markup stays text: an
 * Admin who pastes `<script>` from an external document publishes those characters,
 * not that element.
 */
const renderPostDocument = renderJSONContentToReactElement({
  nodeMapping: {
    doc: ({ children }) => <Fragment>{children}</Fragment>,
    paragraph: ({ children }) => <p>{children}</p>,
    text: ({ node }) => node.text ?? null,
    hardBreak: () => <br />,
    // `parsePostMarkdown` has already clamped the level into POST_HEADING_LEVELS. A
    // document that arrived some other way is clamped the same way here, so no route
    // into this renderer can emit a heading tag outside the enabled set.
    heading: ({ node, children }) =>
      Number(node.attrs?.level) >= SUBSECTION_HEADING_LEVEL ? <h3>{children}</h3> : <h2>{children}</h2>,
    bulletList: ({ children }) => <ul>{children}</ul>,
    orderedList: ({ children }) => <ol>{children}</ol>,
    listItem: ({ children }) => <li>{children}</li>,
    blockquote: ({ children }) => <blockquote>{children}</blockquote>,
    horizontalRule: () => <hr />,
    // Markdown tables are always a header row followed by body rows, so there is no
    // thead/tbody split to reconstruct — one tbody keeps the markup valid.
    //
    // The colgroup is not decoration: the editor emits one, and a table lays its
    // columns out differently with and without it. Leaving it out here is exactly the
    // kind of drift that makes a published Post look unlike the one that was written.
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
      // A link that may not point anywhere still had words. Keeping them loses the
      // destination, which is the part that was not safe, rather than the sentence.
      if (!href) return <Fragment>{children}</Fragment>
      return (
        <a href={href} rel="noopener noreferrer nofollow" target="_blank">
          {children}
        </a>
      )
    }
  },
  // Unknown nodes and marks lose their markup but keep their words. A Post is an
  // announcement to the whole choir; silently swallowing a sentence is worse than
  // showing it unstyled.
  unhandledNode: ({ children }) => <Fragment>{children}</Fragment>,
  unhandledMark: ({ children }) => <Fragment>{children}</Fragment>
})

/** The rendered body of a Post, for tests and callers that already hold a document. */
export function renderPostBody(document: JSONContent): ReactNode {
  return renderPostDocument({ content: document })
}

/**
 * A published Post's body, rendered from its stored Markdown. A Server Component: the
 * editor never enters the read path, so a Member reading the News feed downloads no
 * part of it.
 */
export function PostContent({ markdown, className }: { markdown: string; className?: string }) {
  return <PostProse className={className}>{renderPostBody(parsePostMarkdown(markdown))}</PostProse>
}
