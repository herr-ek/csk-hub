# Organisation definitions

This universal module owns the fixed Group and Position catalogues, domain types, typed
rule violations, and pure date/coverage rules. Import them from `@/core/org-structure` in
server or client code. It contains no database operations, authorization, or management UI.

`identifiers.ts` defines the `GroupType` and `PositionCode` string enums. Use named values
such as `GroupType.Board` and `PositionCode.Secretary` instead of repeating storage strings.
The database enum, form validators, seeds, and catalogue all use these identifiers.

`catalogue.ts` defines Group scope, lifetime, direct-Membership policy and cardinality,
and each Position's stable code, context, prerequisites, grants, and end policy. These
are code-controlled definitions, not runtime-editable records. Both catalogue records are
exhaustive over their identifier enum, so a new identifier requires its policy or definition. Database policy functions
and code-filtered constraints must be kept aligned when the catalogue changes; see the
[Groups database schema](../../../docs/schemas/Groups%20-%20DB%20Scheme.md).

Reads, commands, and management workflows live in
[`org-structure-management`](../../features/org-structure-management/README.md), which
applies these definitions transactionally. Keep dependency direction from that feature
toward this module; core must not import feature code. Effective participation types derive
their Voice shapes from the core database schema without importing the Voice feature.

Annual preparation is limited to the current organisational year and the immediately following
year. Individual Group creation and year edits reject years beyond that window on the server.
Historical years remain available for explicit backfilling and correction. The window advances
on 1 July in the organisation's calendar time zone.


Enum member names and translation keys are English; existing stored values are retained.
`group-names.ts` owns the enum-based list of explicitly named types, shared by command
validation and the database constraint. `labels.ts` formats derived labels through a supplied
intl translator: annual type + year, Choir team type + Choir name, and the parents meeting's
type label. Only Choirs, Sections, GigGroups, and Other Groups store individual names.
Position labels live exclusively in the locale catalogues.
