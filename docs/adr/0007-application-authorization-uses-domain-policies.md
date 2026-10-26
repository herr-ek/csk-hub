---
status: proposed
---

# Application authorization uses domain policies

Application authorization belongs in a server-only `core/authz` module with policies defined
in code for specific actions and resources. Better Auth retains authentication, sessions and
its native account-administration permissions. Its global role/action table cannot express
Memberships, scoped Position holdings, author-private Drafts and retained Conversation history
without additional domain rules, so it will not also own those application policies.

We will not duplicate organisational Groups with Better Auth Organizations. A Position is an
organisational responsibility, not a global permission role, and authority does not automatically
propagate through Choir ownership or across Groups. Admin has explicit administrative grants,
not a blanket privacy bypass. The agreed resource rules are recorded in the
[authorization design and feature adoption guide](../authorization.md).

## Consequences

`core/authz` reads minimal authorization facts directly from database schemas and never imports
features. This deliberately extends the org-structure read-helper convention; organisational
writes and their invariants remain owned by that feature.

Org-structure and authorization must agree on current Memberships and holdings. Stage one retains
`endDate IS NULL`, including its existing future-date behavior. Contract tests compare both
interfaces; no shared period helper or organisational source changes are introduced. A later
move to Stockholm `[startDate, endDate)` periods must change organisational commands, constraints,
reads and authorization together after auditing existing periods.

Stage one adds the module and adoption guide without migrating production feature flows or
implementing Group Post attribution, audience targeting or recall. Existing global Post guards
remain until their read/write/UI callers migrate together; they must not become an OR fallback
for resource policies. This draft records the design discussion, not team approval.
