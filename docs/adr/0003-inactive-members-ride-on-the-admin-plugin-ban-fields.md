# Inactive Members ride on the admin plugin's ban fields

Better Auth's `admin` plugin contributes `banned`, `banReason` and `banExpires` to the
`user` table. Rather than add a project-owned `deactivatedAt` column alongside them, an
Inactive Member (ADR-0002) *is* a `user` row with `banned = true`. `banReason` and
`banExpires` are left null: withdrawing access is permanent until an Admin reverses it,
never time-limited.

## Consequences

The plugin already refuses to create a session for a banned user, so "an Inactive Member
cannot sign in" is enforced inside Better Auth rather than in code we maintain. Adding a
second column would have meant either duplicating that check or keeping two sources of
truth for the same state.

The cost is a vocabulary seam. `banned` is the wrong word for the ordinary outcome of
leaving a choir, and the glossary explicitly avoids it. 

The columns are also carried by the plugin whether or not we use them, so the schema is
no wider for this choice.
