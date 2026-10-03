# Rich text

The editor, the stored document and the reader for rich text, as one feature. It owns
Tiptap: extension configuration, the editor's lifecycle and shortcuts, the toolbar, the
server renderer and the prose stylesheet. A consumer owns two things only — which
features its documents may contain, and the column the document goes in.

```
document/   what a document may contain, and how an untrusted one is normalised   (no React)
editor/     the writing surface: editor, toolbar, editing affordances               (client)
view/       the reading surface: the server renderer                               (server)
prose/      the shared prose wrapper and stylesheet both surfaces draw inside      (either)
```

## Consuming it

```ts
// Which features the documents may contain. Base nodes are always included.
export const postDocument = createDocumentSchema([richText.headings([2, 3]), richText.emphasis, richText.lists])

// Writing: the editor emits the document as JSON into a form field.
<RichTextEditor schema={postDocument} name="body" labelledBy={labelId} placeholder={t("bodyPlaceholder")} />

// Receiving: never store what the browser sent; store what the schema makes of it.
const document = postDocument.parse(formData.get("body"))   // RichTextDocument | null

// Reading: server-only, from `@/features/rich-text/view`.
<RichTextContent document={row.body} />

// Reading inside something that is itself a link, such as a feed card.
<RichTextContent document={row.body} linksAsText />
```

`parse` and `normalize` are the boundary. They drop nodes, marks and attributes outside
the schema, move a heading to the nearest allowed level, strip a link whose destination
is unsafe, and return `null` for a document the schema could not have produced or one
with nothing to read. The editor never makes such a document, so `null` means the input
came from somewhere else, and the form should say so rather than repair it.

`@/features/rich-text` is safe for Client Components. `@/features/rich-text/view` is
server-only, because rendering a stored document must never ship the editor to a reader.

## Adding a feature

A feature is a node or a mark. Adding one touches three lists and one stylesheet, and
nothing in any consumer until the consumer opts in:

1. **`document/features.ts`** — add a group to `richText`, configured the way every
   consumer gets it. Keep the Tiptap version pinned exactly with the rest.
2. **`view/rich-text-content.tsx`** — add an entry to `nodeMapping` or `markMapping`. The
   mapping is an allowlist: a node without one keeps its words and loses its markup, so a
   forgotten entry degrades quietly rather than failing loudly. Never hand anything to
   `dangerouslySetInnerHTML`.
3. **`editor/rich-text-toolbar.tsx`** — add a control if the feature is hard to type.
   Show it only when `editor.schema` has the node, as the others do.
4. **`prose/rich-text-prose.css`** — style it once. The editor keeps its content one level
   deeper, inside ProseMirror's own element, so block-level selectors name both levels;
   the declarations behind the two selectors must never become two copies.
5. **`view/rendering-parity.test.tsx`** — add a row. It renders the same document through
   the editor's DOM spec and the server renderer and compares the element names, so a
   missing step 2 fails here rather than in front of a reader. Element names are all it
   compares; an attribute that changes how the node looks, like a table cell's `align`,
   needs its own assertion there.

An extension that only changes editing behaviour — undo, a drop cursor, a keymap — adds
nothing to the document and goes in `editor/editing-affordances.ts` instead.
`exit-empty-heading.ts` is the worked example.

## Things worth knowing

**The editor renders only in the browser.** Tiptap draws random keys while rendering,
which a Cache Components prerender refuses. `RichTextEditor` draws an empty frame on the
server and mounts Tiptap after hydration, so a consumer needs no `<Suspense>` of its own
around it. The hidden form field sits outside that switch and carries `defaultValue`
from the first paint.

**One link rule, not two.** `safeLinkHref` is both the editor's `isAllowedUri` and the
normaliser's check, so a link that survives typing survives publication. Tiptap's
`protocols` option would not do: it *adds* to Tiptap's defaults rather than replacing
them, which would let `ftp:` or `tel:` autolink in the editor and then vanish on the way
into the column.

**A hard break is not a node here.** `Shift+Enter` would store a `<br>`, widening the
stored vocabulary past what a consumer opted in to, so `HardBreak` is deliberately out of
`baseFeatures`. Enter for a new paragraph is the whole of the line-breaking story.

**Attributes are pruned to what the node declares.** A pasted `style` or `onclick`
never reaches the column. If a new node needs an attribute checked rather than merely
declared, add a rule to `attributeRules` in `document/document-schema.ts` — heading
levels and link hrefs are the two existing ones.

**Decoration is not document.** Anything Tiptap draws through ProseMirror decorations
— syntax highlighting, say — has no server-side counterpart and would need a second
implementation kept in step by hand. Plain nodes first; decoration is its own decision.

**Search reads the document in SQL.** The posts schema's generated `body_search` column
extracts text nodes with `jsonb_path_query_array(body, 'strict $.**.text')`. A new node
whose words live anywhere but `text` nodes is invisible to it.
