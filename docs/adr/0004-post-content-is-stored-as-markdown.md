# Post content is stored as Markdown

A Post's body is written in a rich-text editor (Tiptap) but persisted as a Markdown
string, not as the editor's own document JSON and not as HTML. The editor serialises to
Markdown on save and parses Markdown back on edit; the feed renders Markdown to
sanitised HTML on the server.

We considered storing the ProseMirror/Tiptap document JSON, which would be lossless and
needs no serialisation step, and storing sanitised HTML, which is the cheapest to render.
Both were rejected for the same reason: they tie the stored content to a rendering
decision. The editor is the part of this feature most likely to be replaced.

## Consequences

The stored column is legible on its own. A Post can be read, searched, diffed and
migrated without instantiating an editor, and a future surface — a digest email, an
export, a different editor — consumes Markdown rather than reverse-engineering a document
schema.

The cost is a round-trip obligation. Every node the editor enables must survive
Markdown → editor → Markdown unchanged, which is why the enabled set is deliberately
small: h2/h3, bold, italic, bullet and ordered lists, links, tables, blockquote and
horizontal rule. Anything outside that set is not merely unstyled, it is lossy. Adding a
node is therefore a decision about the storage format, not a toggle in the editor
configuration.

Markdown tables are also weaker than HTML ones — no merged cells, no alignment beyond the
basics. The Klokstäd rota that motivated tables fits inside that limit; a genuinely
tabular feature would not, and belongs to the milestone that owns the data rather than to
a prose field.

Two render paths now exist for the same content — the editor's and the server's — and
they must be visually indistinguishable to a reader. They share one prose stylesheet
rather than two kept in step by hand.
