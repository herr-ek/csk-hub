# Posts are stored as Markdown

A Post's `body` column holds Markdown source, not HTML. The compose form is a plain
textarea today — it neither renders Markdown nor produces it deliberately — but plain
text is already valid Markdown, so what it writes is a legal value of the format the
column is declared to hold. Deciding the format now is what lets an editor that does
understand Markdown replace the textarea without a migration.

## Consequences

The stored value stays readable and diffable, and it survives a change of editor: an
editor becomes a rendering choice on top of the format rather than the owner of it.
Storing HTML instead would have tied every Post to whatever the editor emitted on the day
it was written, and would have put untrusted markup in the database rather than at the
boundary where it is escaped.

Nothing renders the Markdown yet. `/news/[id]` prints the body as preformatted text,
which is honest for the plain text being written today and wrong the moment someone types
a heading. Rendering is a follow-up, and when it arrives it has to sanitise on every path
that turns a Post into HTML — there is no point at which the stored value can be assumed
safe. Any feature that consumes Posts outside the feed, a future email digest most
obviously, has to render the Markdown itself rather than reading a prepared HTML column.
