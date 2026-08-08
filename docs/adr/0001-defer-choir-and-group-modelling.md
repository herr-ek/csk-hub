# Defer choir and group modelling

Chalmers Choirs contains several distinct choirs and groups, but the MVP models
membership as flat: every Member belongs to the organisation, and information goes to
everyone. We considered adopting Better Auth's `organization` plugin up front, with
Organization = Choir and Members belonging to several at once, and deliberately chose not
to — the group functionality is being designed separately and we would have been guessing
at its shape.

## Consequences

This is additive to undo, not destructive. The `organization` plugin creates new
`organization`, `member`, and `invitation` tables and does not restructure `user`, so
adopting it later is a migration that backfills memberships rather than one that rewrites
identity. The real cost lands in application code: every query that lists Members or
targets information will gain a scope it does not have today.

A flat `user` table in an organisation that visibly has many choirs reads as an
oversight. It is not.
