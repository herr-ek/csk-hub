# Authorization design and feature adoption

This guide records the agreed application rules, the implemented boundaries and remaining work.
[ADR 0007](adr/0007-application-authorization-uses-domain-policies.md) remains proposed, subject to
the team discussion required by CONTRIBUTING.md.

## Delivery status

1. **Core policies — implemented.** `src/core/authz` owns code-defined action/resource policies,
   trusted fresh identity and minimal database facts. It never imports features.
2. **Personal Posts — implemented.** Active Users can publish as themselves. Author/Admin policies
   protect published work; private Drafts stay author-only. Reads, commands, routes and UI agree.
3. **Existing feature adoption — implemented.** Members, Messaging, organisational administration,
   User management, notification broadcast and local account settings use fresh central authority.
   Native Better Auth account endpoints retain their own permissions.
4. **Group Posts — deferred.** Attribution, audiences and Recalled Group Posts require a coordinated
   schema/read/write/UI change. Event instance policies also await feature implementation.

There are no schema changes or organisational period changes in stages two and three.
`core/auth/permissions.server.ts` and the cached identity-only guard are removed. Better Auth's
statements now contain only native User/Session grants, without an application Post fallback.
The glossary includes future domain behavior; it does not imply all that behavior is implemented.

## Responsibility and interface

Features import `@/core/authz`; authz imports `core/auth`, `core/db` and generic shared helpers.
Minimal fact projections directly from schemas are a deliberate exception to org-structure's
ordinary read-helper convention. Organisational writes still go through that feature. Document
validation, lifecycle predicates and Conversation history remain feature-owned.

```ts
import { can, requirePermission } from "@/core/authz"

const mayEdit = await can({ action: "post.update", postId }) // UI hint only

await db.transaction(async (tx) => {
  const actor = await requirePermission({ action: "post.update", postId }, tx)
  // Persist with the feature's lifecycle predicates, attributing to actor.userId.
})
```

`requirePermission` returns `{ userId, isAdmin, impersonatedBy }` or throws
`AuthorizationDeniedError`. Never accept actor identity or ownership claims from browser input.
`can` uses the same policy but returns false for expected denials. Unexpected session/database
failures propagate. Map denials to localized feature errors or 404s without exposing the error's
server-side actor/resource diagnostics. Rendering guards require Suspense and stay outside caches.

`requireMessagingUserId(tx?)` derives fresh active identity and rejects support impersonation.
It does not grant Conversation access. `isCurrentMemberOfGroup(groupId, tx?)` and
`holdsCurrentPosition({ groupId, positionId? }, tx?)` answer facts about the effective User,
including archived Groups; they are not grants. Position UUIDs identify records. Do not hardcode
mutable titles or environment-specific seed UUIDs as policy identities. Specific Choir Position
grants remain deferred.

## Policies against today's schema

Every policy requires a freshly validated session and active User. Admin has explicit grants,
not a universal bypass. Unknown actions and invalid/missing resources fail closed.

| Request | Grant |
| --- | --- |
| `app.access` | Any active User |
| `messaging.access` | Active User outside support impersonation |
| `post.create` | Any active User may create/publish personal content |
| `post.read` | Published Posts by active Users; private Drafts only by their author |
| `post.update` | Own Draft; published personal content by its author or Admin |
| `post.publish`, `post.discard` | Own live Draft |
| `post.unpublish` | Published personal content by its author or Admin |
| `group.publishPost`, `group.manageContent`, `group.manageEvents` | Admin, or current Position holder with current Membership in that exact active non-Choir Group |
| `group.manageMemberships`, `group.managePositions` | Admin, for an existing active Group |
| `org.manage`, `user.administer`, `notification.broadcast`, `admin.access` | Explicit Admin grants; feature safeguards still apply |
| `member.read` | Active Users may read other active Users' shared profiles |
| `member.readEmail` | Profile owner only; no Admin bypass |
| `member.editProfile` | Profile owner outside support impersonation |

Discarded Posts are inaccessible. Group requests express authority to represent a Group; they
cannot authorize an arbitrary Post, Event or Conversation ID. Future instance policies must bind
the resource to its representing/organiser Group. Choir operations remain Admin-only. No grant
propagates through `choirId`, linked holdings or the Board to unrelated Groups.

## Freshness, locks and limitations

`getFreshRequestSession()` bypasses Better Auth's five-minute cookie cache, disables session
refresh and is not React-cached. Authz reloads the effective User's roles and `banned` status.
An impersonated session receives the effective User's grants, never the supporting Admin's.
`getRequestSession()` remains suitable for presentation metadata, with ordinary refresh behavior.

`requirePermission(request, tx)` recognizes a database transaction and locks the User with
`FOR SHARE`, then validates and locks the stored Session with `FOR SHARE`. This matches Better
Auth deactivation's User-before-Session order. Production sessions always provide their ID;
trusted factory test resolvers may omit it. A revocation or deactivation that wins the lock race
denies the operation; otherwise it waits for the protected transaction to finish. Session expiry
is checked when authorizing, not continuously until commit. Fresh validation disables refresh to
avoid separate-connection Session writes while those locks are held.

Post guards additionally lock the Post: `FOR SHARE` for `post.read`, `FOR UPDATE` for other
instance requests. This prevents an intervening Unpublish from exposing a foreign private Draft
to an editor and keeps lifecycle authorization aligned with the write. Preserve the persistence
predicates as well as the guard. `can` takes no such locks and is never a durable grant.

Features retain their additional coordination:

- Profile writes take a User `FOR NO KEY UPDATE` lock before the transactional guard. Concurrent
  User-row writes must not both take shared locks and then try to upgrade them. Locale preferences
  live in their own table and retain their atomic partial-update behavior.
- Messaging keeps recipient locks, Conversation locks, Group Membership shared read locks,
  departure cutoffs and authorization callbacks before retry lookup/append.
- Org-structure retains savepoints, per-User advisory locks, archiving locks and invariants.
  Group grant checks currently do not lock Memberships or holdings. Before adding Group-authorized
  content writes, coordinate them with the existing handover/departure writers; passing `tx`
  alone is insufficient. Review lock ordering before introducing a new sequence.
- Better Auth API mutations run their own transactions, and notification delivery is external.
  Their preliminary central checks do not make those later effects atomic with session revocation.

## Personal Posts: implemented boundaries

| Seam | Current behavior |
| --- | --- |
| `posts/compose/actions.ts` | Validates input, checks the exact `post.*` request and persists inside one transaction; actor comes from the guard |
| `posts/lifecycle.ts` | Low-level server persistence; caller must establish authority in the same transaction; author/state/discard predicates retained |
| `posts/service.ts/listNewsFeed` | Fresh active reader; published collection only |
| `posts/service.ts/listOwnDrafts` | Derives author from authority; no arbitrary author-ID input |
| `posts/service.ts/getPublishedPost`, `getEditablePost` | Guard and content read share a transaction/Post lock; forbidden or absent returns null |
| News, detail and compose screens | Resource capabilities shape controls; direct reads and action submissions check independently |
| `core/auth/route-access.ts` | Composition route available to authenticated Users; no per-resource queries in Proxy |

`posts/compose/actions.test.ts`, `posts/lifecycle.test.ts`, `test/authz.test.ts` and
`test/authz-adoption.test.ts` cover direct action denials, attribution, private Drafts, lifecycle
changes and serialization with revocation/deactivation/unpublishing.

## Members and self-profile: implemented boundaries

`members/query.ts` establishes fresh active identity for directory/profile/editor reads. Shared
profiles require `member.read`; email is masked unless `member.readEmail` allows it. Edit controls
use `member.editProfile`. Active-target filtering, directory projections and existing inactive
viewer/target handling remain in the service.

`edit-profile/actions.ts` derives actor and impersonation state. `saveOwnVoiceCapabilities` checks
`member.editProfile` inside the existing User-locked transaction before calling the Voice module.
The Voice capability primitives remain independent of request identity; callers must authorize.
These grants do not permit editing arbitrary User fields or reading others' email. Existing
service/action tests cover ownership, inactive Users and impersonation.

## Organisational administration: implemented boundaries

`org-structure/ui/run-command.ts` requires `org.manage` before parsing the form, then checks the
specific request inside the transaction used by the domain command. Structure/catalogue work uses
`org.manage`; existing Group Membership/Voice operations use `group.manageMemberships`; holder
operations use `group.managePositions`. All are currently Admin-only. Creating a Group does not
require a nonexistent Group ID.

Protected screen queries in `ui/choirs`, `ui/groups`, `ui/detail`, `ui/catalogue` and
`ui/group-summaries.ts` require `org.manage` themselves. Domain commands/read helpers remain
session-independent for composition and operations. No period helper or date reinterpretation is
introduced. Existing results, savepoints, advisory locks and invariant tests remain intact.

## User management and broadcast: implemented boundaries

`user-management/service.ts/listUsers`, invitation entrypoints, sensitive import lookup and all
administration actions require `user.administer`. Native Better Auth User/Session permissions,
self/final-Admin checks, inactive-before-Erasure, literal confirmation and impersonation-target
checks remain. Central policy never bypasses them.

The three `notification-broadcast/actions.ts` entrypoints require `notification.broadcast`,
including subscription search. Notification infrastructure still owns delivery and subscriptions,
not feature authority or recipient selection.

## Messaging: implemented boundaries

Protected inbox/search reads, Conversation page reads, read markers, sends, Direct starts and Group
Conversation commands derive identity with `requireMessagingUserId`. Transactional operations
recheck through the same boundary inside their transaction. Direct command calls also reject
support impersonation; UI adapters translate that denial to the existing localized error.

Conversation Membership remains the source of Conversation authority. Organisational Group grants
give no Messaging access. Direct-pair checks, recipient availability, Group authorization callbacks,
idempotency, signed read tokens, departure cutoffs and unread filtering remain unchanged. Former
Group Conversation members retain their allowed Message range without receiving a current member
list. The shared Direct lookup accepts trusted caller IDs and grants no access by itself.

Keep command, departure/read-lock, idempotency and recipient-deactivation tests. If these policies
later move into core, move the complete readable-range rule and its tests together.

## Routes, account settings and future Events

Proxy and `route-access.ts` use cheap cached-session presentation gates. Admin pages establish
`admin.access`; navigation uses fresh `app.access`/`admin.access` hints. Neither layout nor Proxy
replaces data/action guards. `/api` is excluded from Proxy; Better Auth's catch-all handler enforces
its own native endpoint rules.

Account settings rendering, locale updates, subscription writes and self push tests require
`app.access` and derive their actor. Locale and subscription writes check inside their database
transaction. Passwords, passkeys, sessions, username, email verification and 2FA continue through
native Better Auth endpoints. Locale/push settings keep their existing impersonation behavior;
the narrow self-profile restriction is not silently extended to every account operation.

`features/events` contains schema tests only. Future Event instance policies must bind management
to `organiserGroupId`, separately from audience and `createdBy`. Non-Choir organiser Position
holders manage that organiser's Events; Choir grants remain Admin-only. Do not adopt broader
Choir/subgroup/target-based authority from schema examples without revisiting the decision.
Response reasons, Registration answers and Section-scoped Stämförälder attendance require explicit
field-level policies when implemented. Rich text has no separate protected persistence workflow.

## Stage four: Group attribution, targeting and recall

The Post schema currently has only personal `authorId`, `publishedAt` and `discardedAt`.
Implement a separate representing Group reference while retaining the human author's identity;
an audience-target model; and an explicit recalled-Group state distinguishable from private Drafts.
Do not infer publication identity from the author's current holdings or overload `authorId`.

Before a Group publication, validate authority for its representing Group and proposed audience.
Both personal and Group-authored Posts may address all CSK or Groups in which the publisher
currently has Membership. Representation and destination are independent: publishing as KKB to
KK does not grant editing of KK's content or publishing as KK. A changed destination or representing
Group must be checked against the proposed values, not only the old Post.

Audience targets restrict visibility in the feed, search, direct links, previews, counts and
notifications. Filter in the database before pagination/counting; do not fetch a page then remove
forbidden rows. Detail and collection visibility must share a rule and have equivalence tests.
Use current Membership at read time initially; newcomers can see older notices and former members
lose audience-based access. For published content, authorship and current content-management
authority remain separate access grounds. Historical-Membership access, particularly for Choirs/Sections, is an open
investigation, not a grant. Resolve archived-target history explicitly when implementing targets.

Never-published Drafts are author-private even if intended for a Group. Unpublishing a personal
Post restores its private Draft. Unpublishing Group content produces a Recalled Group Post that
current Group content managers can read, revise and republish. Losing a Position removes Group
management authority; authorship remains attribution, not continued Group management.

Update `posts/lifecycle.ts`, `service.ts`, compose actions/forms/screens and read view models in the
same change as the schema migration. Cover handover to a different holder, former authors,
republication, mixed audiences, untrusted Group IDs and confidentiality of every collection surface.
The existing Groups schema's Choir-wide permission examples must be reconciled with direct-Group
scope and the current Admin-only Choir decision; they are not automatic grants.

## Future organisational period change: always coordinated

Today, both org-structure and authz mean **`endDate IS NULL`**. A future start grants current
status immediately. A future end removes current status immediately. The current implementation
preserves those consequences with contract tests; it does not introduce a shared period helper
or reinterpret dates inside authz alone.

The agreed future direction is Stockholm calendar dates with `[startDate, endDate)` periods.
Before adopting it, change the following together:

1. Audit existing Memberships/holdings for overlaps, future dates, zero-length terms and partial
   linked holdings. Partial unique indexes protect open-ended rows, not effective-date overlap.
2. Define scheduling and immediate termination consistently, including cascades. Update
   `membership.ts`, `positions.ts`, `linked-positions.ts`, `lookup.ts` and relevant `structure.ts`
   constraints; same-user holding checks currently do not exclude every cross-user overlap.
3. Strengthen transactional/range invariants for one effective holder and elected Position rules.
   Coordinate with per-user/Group locking instead of assuming the current indexes enforce ranges.
4. Update `reads.ts`, `ui/detail/query.ts`, `ui/group-summaries.ts`, other organisational consumers,
   authz fact queries and relevant schema documentation in one change. Update historical Event
   audience calculations too: the design schema currently uses an inclusive end date.
5. Extend parity tests for before/on/after start/end, future handover, same-day replacement,
   departure cascades, archive behavior and concurrent changes. Update the glossary only when
   org and authz adopt the new definition together.

Historical Post access for former Choir/Section members, finer Choir Position grants, and a
persistent identity for linked appointments remain separate investigations. Neither static
Position names nor the existence of an old Membership should silently grant access meanwhile.
