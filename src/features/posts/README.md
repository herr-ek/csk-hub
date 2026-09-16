# Extending the Post editor

A Post's body is written in Tiptap but stored as Markdown ([ADR-0004](../../../docs/adr/0004-post-content-is-stored-as-markdown.md)).
That one decision is what makes adding to the editor more involved than adding an
extension to the `useEditor` call, and it is worth understanding before reaching for a
package.

## First, which kind of extension is this?

**An extension that adds a node or a mark** — a code block, a task list, an image —
changes what a stored Post can contain. Markdown has to be able to write it down and
read it back unchanged, the server has to know how to render it, and the decision
outlives the editor that motivated it. These go in `postBodyExtensions`
(`markdown/extensions.ts`) and are the subject of the checklist below.

**An extension that only changes editing behaviour** — undo, a drop cursor, a keymap,
a placeholder — adds nothing to the document. Nothing downstream needs to know about
it. These go in `editingAffordances` (`compose/post-editor.tsx`) and need none of the
steps below. `compose/exit-empty-heading.ts` is the worked example: it turns an emptied
heading back into a paragraph on Enter, and because it only ever *replaces* a node, the
enabled set is untouched.

If you are unsure which you are holding, ask whether the stored Markdown could change.
If it could, it is the first kind.

## Adding a node or a mark

### 1. Install the extension

```bash
bun add @tiptap/extension-code @tiptap/extension-code-block
```

Keep the version pinned to the rest of the Tiptap packages in `package.json`. They are
pinned exactly, not by range, because a schema is not a detail that should drift under a
patch release.

### 2. Add it to `postBodyExtensions`

`markdown/extensions.ts` is the single source of truth. One list feeds three consumers:
the editor's schema, the `MarkdownManager` that parses and serialises
(`markdown/markdown.ts`), and the parity test's schema. Adding it here is what makes the
node exist at all.

### 3. Check the Markdown round trip

This is usually free. `MarkdownManager` reads `markdownTokenName`, `parseMarkdown`,
`renderMarkdown` and `code` straight off each extension's config, and Tiptap's own
extensions carry the ones they need — so both directions start working from being in
the list.

Verify it rather than assuming it, because an extension without those fields serialises
to nothing and silently eats the content:

````ts
serializePostMarkdown(parsePostMarkdown("```ts\nconst a = 1\n```"))
````

If the round trip is not clean, that is the ADR-0004 obligation failing, and the node
does not belong in the enabled set until it is. Writing the missing `parseMarkdown` and
`renderMarkdown` yourself is legitimate; storing something Markdown cannot hold is not.

### 4. Map it in the server renderer

**This is the step that is not free.** `markdown/post-content.tsx` holds a hand-written
`nodeMapping` and `markMapping` — an allowlist, not a fallback. A node with no entry
falls through `unhandledNode`: its words survive, its markup does not. That is
deliberate, so a Post never loses a sentence, but it does mean a forgotten entry
degrades quietly instead of failing loudly.

Nothing here is ever handed to `dangerouslySetInnerHTML`. Text that looks like markup
stays text, which is what keeps a pasted `<script>` a published string rather than an
element. Keep it that way.

### 5. Style it in `markdown/post-prose.css`

One stylesheet, imported only by `PostProse`, wrapped around both the editor and the
published Post. The editor keeps its content one level deeper, inside ProseMirror's own
element, so block-level selectors have to name that level too — see the existing
`.post-prose > * + *` pair. The declarations behind the two selectors must never become
two copies.

### 6. Give it a toolbar control, if it needs one

`compose/post-editor-toolbar.tsx`. Often unnecessary: Tiptap's input rules mean typing
```` ``` ```` or `## ` already produces the node, and the placeholder advertises that. Add a
button when the node is hard to discover or hard to type.

### 7. Add a row to the parity test

`markdown/rendering-parity.test.tsx` renders the same Markdown through both paths and
compares the element names they produce. A missing step 4 fails here rather than in
front of a Member. Add the node to the `test.each` table and to the whole-Post case
below it.

Note its limit: it compares tag names, not attributes or classes. Two surfaces emitting
`<code class="language-ts">` and a bare `<code>` will pass it. Where a class carries
meaning, assert it directly in `markdown/post-content.test.tsx`.

### 8. Write an ADR

ADR-0004 puts it plainly: *"Adding a node is therefore a decision about the storage
format, not a toggle in the editor configuration."* Follow
[CONTRIBUTING.md](../../../CONTRIBUTING.md#architectural-decision-records) — draft it on
the branch, and keep references to it inside that branch and PR until it is on `master`.

## Traps worth knowing

**Anything rendered by decoration rather than by the document.** Syntax highlighting is
the obvious one: `CodeBlockLowlight` highlights through ProseMirror decorations, which
the server renderer has no equivalent for. Reproducing it there means a second
highlighter kept in step by hand — exactly the drift ADR-0004 exists to prevent. Plain
code blocks first; highlighting is its own decision, with its own ADR.

**Nodes that constrain their content.** `CodeBlock` is `content: 'text*'` with
`marks: ''`, so bold inside it is not a bug. The `Code` mark's `excludes: '_'` means it
will not combine with bold or italic either. Know this before someone reports it.

**Nodes that take over keys.** Enter inside a code block inserts a newline rather than
leaving the block; `exitOnTripleEnter` and `exitOnArrowDown` are how a writer gets out.
When a new node claims a key, check it against the keymap tests in
`compose/post-editor-keymap.test.ts`.

**Escaping.** Extensions with `code: true` join the manager's `codeTypes`, which
suppresses the backslash-escaping applied to ordinary text. That is why `` `a_b_c` ``
round-trips intact and why a node that holds literal text needs that flag.

## Checking your work

```bash
bun run tst        # parity, rendering and keymap tests
bun run typecheck
bun lint
bun run dev:local  # then write a Post at /news/new and publish it
```

The last one matters more than it looks. The two render paths are meant to be
indistinguishable to a reader, and the cheapest way to know they still are is to write
the node in the editor and then look at the published Post.
