# Organisation definitions

This universal module owns the fixed Group and Position catalogues, domain types, typed
rule violations, and pure date/coverage rules. Import them from `@/core/org-structure` in
server or client code. It contains no database operations, authorization, or management UI.

`catalogue.ts` defines Group scope, lifetime, direct-Membership policy and cardinality,
and each Position's stable code, context, prerequisites, grants, and end policy. These
are code-controlled definitions, not runtime-editable records. Database policy functions
and code-filtered constraints must be kept aligned when the catalogue changes; see the
[Groups database schema](../../../docs/schemas/Groups%20-%20DB%20Scheme.md).

Reads, commands, and management workflows live in
[`org-structure-management`](../../features/org-structure-management/README.md), which
applies these definitions transactionally. Keep dependency direction from that feature
toward this module; core must not import feature code. Effective participation types derive
their Voice shapes from the core database schema without importing the Voice feature.
