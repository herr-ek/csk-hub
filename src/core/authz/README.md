# Application authorization

`@/core/authz` is a server-only module for action/resource policies. It reads trusted identity
through `core/auth` and authorization facts directly from `core/db`; it never imports features.
Policies live in code. Better Auth retains authentication and its native account-administration
permissions. The detailed policy decisions and feature adoption map are in
[`docs/authorization.md`](../../../docs/authorization.md).

Stages one through three are implemented: personal Posts, Members, Messaging, account settings,
administrative workflows, routes and navigation use these policies. Better Auth no longer carries
application Post grants; the legacy application permission guards have been removed. Group-authored
Posts, audience targets, Recalled Group Posts and Event instance policies remain unimplemented.

## Interface

```ts
import { can, requirePermission, isCurrentMemberOfGroup, holdsCurrentPosition } from "@/core/authz"

const showEdit = await can({ action: "post.update", postId })
const belongs = await isCurrentMemberOfGroup(groupId)
const holds = await holdsCurrentPosition({ groupId, positionId })
```

`can` returns false for expected denials. `requirePermission` checks the same policy and either
returns `{ userId, isAdmin, impersonatedBy }` for attribution or throws `AuthorizationDeniedError`.
Unexpected session/database failures propagate from both. `requireMessagingUserId(tx?)` derives
fresh active identity and denies support impersonation; Conversation access remains feature-owned.
`PermissionRequest` is a typed union;
unsupported actions fail closed at runtime. Universal types are also available from
`@/core/authz/model`, without importing the server entrypoint.

Every operation validates the request session without Better Auth's cookie cache, then reads
the User's current role and active status. It takes neither an actor ID nor browser-supplied
ownership/Position claims. No authorization result is cached. Rendering callers need Suspense
and must stay outside Next.js cache scopes, as with other session reads.

Both permission functions and both fact functions accept an optional database/transaction as
their final argument. A protected command must pass its transaction and preserve its lifecycle
predicates. Transactional guards lock the User and stored Session, and Post requests lock the
Post row. Group Membership/Position changes still require explicit coordination; see the adoption
guide for those locks. Fresh validation disables session refresh to avoid writing through a
separate connection while a transaction holds a Session lock.
Do not interpret a successful UI check as authority for a subsequent request.

The Membership/Position functions are facts, not grants: like org-structure, they report rows
with no end date, including archived Groups and future start dates. Group permissions also
require an active Group and, for non-Admin holders, a current Membership. A fact that someone
holds a Position must never be substituted for a permission check.

## Tests and composition

`createAuthorization({ database, readSession })` composes the same interface against an isolated
database and a trusted server session resolver. It is not a client-facing authentication
endpoint. The production entrypoint supplies `getFreshRequestSession`; tests supply explicit
session state. The factory itself lives at `@/core/authz/authorization` so tests need not import
the request/Next.js composition.

[`test/authz.test.ts`](../../../test/authz.test.ts) exercises the interface against a migrated,
disposable local PostgreSQL database. It also compares Membership and Position facts with the
org-structure public reads. No shared organisational period helper or date-semantics rewrite is
introduced.
[`test/authz-adoption.test.ts`](../../../test/authz-adoption.test.ts) covers protected Post reads
and serialization with deactivation, session revocation and unpublishing. Feature tests retain
their lifecycle, profile and Conversation invariants.
