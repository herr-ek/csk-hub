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

The news feed is the first feature to pay this cost. Every Post goes to every Member,
which matches the monthly email it grows out of, so a flat feed is parity rather than a
regression. The bill comes due when a conductor wants to reach one Choir, or a
rota concerns one voice section: adding a scope to Posts is additive, but until then
Members will read notices that do not apply to them, and a feed people learn to skim is
harder to fix than a schema.
