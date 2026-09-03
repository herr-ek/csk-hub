# Posts are stored as Markdown

A Post's `body` column holds Markdown source, not HTML and not a rich-text editor's own
document format. Admins will write in a rich-text editor, but what reaches the database
is the Markdown that editor produces, and the feed renders it server-side to sanitised
HTML. The walking skeleton writes plain text, which is already valid Markdown, so the
editor arrives without a migration.

## Consequences

The stored value stays readable and diffable, and it survives a change of editor: the
editor is a rendering choice on top of the format, not the owner of it. Storing HTML
instead would have tied every Post to whatever the editor emitted on the day it was
written, and would have put untrusted markup in the database rather than at the boundary
where it is escaped.

Sanitisation moves to render time and must happen on every path that turns a Post into
HTML — there is no point at which the stored value can be assumed safe. Any feature that
consumes Posts outside the feed, a future email digest most obviously, has to render the
Markdown itself rather than reading a prepared HTML column.

The visible risk is drift between what the editor shows and what the feed renders. The
two are the same document, so they must agree; where they cannot, the feed's rendering is
authoritative because it is what Members see.
