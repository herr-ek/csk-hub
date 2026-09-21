# Post content is stored as the editor's document

A Post's body is written in a rich-text editor (Tiptap) and persisted as that editor's
own document — ProseMirror JSON in a `jsonb` column. Not Markdown, not HTML. The write
path normalises the submitted document against the Post's schema before storing it; the
read path renders the stored document to React on the server.

We considered Markdown, which reads well on its own and is what an earlier draft of this
feature implemented. It was rejected because it puts a serialisation layer between the
editor and the column, and pays for that layer with a round-trip obligation: every node
the editor offers must survive Markdown → editor → Markdown unchanged, which is a real
constraint on what the editor may offer (no merged table cells, no alignment) and makes
enabling a node a storage decision rather than a product one. Sanitised HTML was
rejected for tying the stored content to one rendering.

## Consequences

The editor's format is the storage format, so there is no parse or serialise step and
nothing that can be lossy. What a Post may contain is decided in one list
(`postDocument` in `src/features/posts`) and enforced on write by the `rich-text`
feature's normaliser, which drops anything outside that list and refuses a document the
schema could not have produced. The editor offers exactly that list; a node outside it is
neither typeable nor storable.

The document arrives from the browser as JSON. That makes the write path the one place
that must not trust it — normalisation is a security boundary, not a tidy-up — and
`safeLinkHref` is applied both there and again on read, so a row written under an older
rule cannot place an unsafe destination on a page.

The cost is legibility. A `jsonb` document is not something a person, an email digest or
a search index reads directly. Search is met without storing the prose twice: an
immutable SQL function, `post_body_text(jsonb)`, extracts the text nodes, and a generated
`tsvector` column over it feeds a GIN index. The words live in one column; the index
holds lexemes. Any other consumer of the text — a digest, a preview — walks the document
it has already loaded rather than reading a second stored copy.

The text search configuration is `swedish`, matching the default locale. A Post written
in another language is stemmed wrongly until Posts carry a language of their own.

Two render paths exist for the same document — the editor's and the server's — and a
reader must not be able to tell them apart. They share one prose stylesheet, and a test
asserts they emit the same elements for every supported node.
