# Authorization design and feature adoption

This guide records the authorization discussion and the exact seams for adopting `core/authz`.
It describes the intended application rules as well as capabilities not implemented yet.
The architectural decision is drafted in
[ADR 0007](adr/0007-application-authorization-uses-domain-policies.md); it remains proposed,
subject to the team discussion required by CONTRIBUTING.md.

## Stage-one delivery and its limits

Stage one provides `src/core/authz`, a fresh-session helper in `src/core/auth/session.server.ts`,
tests, and this guide. It does **not** migrate existing feature guards, change route/menu access,
widen production Post permissions, alter org-structure, or add database tables/columns.
The glossary describes agreed domain behavior; it is not a statement that all of that behavior
already exists in the application.

The legacy `core/auth/permissions.ts`, `permissions.server.ts` and `route-access.ts` remain active
until their callers are migrated. A feature must switch its authoritative read/write checks
and relevant UI gates together. Do not combine legacy global Post grants and resource policies
as an OR fallback. When the final Post caller migrates, remove application Post grants from
Better Auth's statements and retain its native User/Session grants.

## Responsibility and interface

Features import `@/core/authz`; authorization imports `core/auth`, `core/db` and generic shared
helpers, never features. Authorization owns its minimal fact projections from database schemas.
This is a deliberate exception to org-structure's ordinary read-helper convention. Organisational
writes still go through org-structure, and document validation remains feature-owned.

```ts
import { can, requirePermission } from "@/core/authz"

const mayEdit = await can({ action: "post.update", postId }) // UI hint only
```

At a protected write, use `requirePermission(request, tx)` inside the transaction after the
required locks, then attribute using its returned actor. Do not accept actor identity from the
request payload. `can` and `requirePermission` use the same policies; missing/forbidden resources
are denials, and unexpected session/DB failures propagate. Map denials to existing localized
feature errors or 404s without exposing the error's server-side actor/resource diagnostics.

`isCurrentMemberOfGroup(groupId, tx?)` and
`holdsCurrentPosition({ groupId, positionId? }, tx?)` answer facts about the effective User.
They do not authorize operations. Position UUIDs identify the specific record; mutable display
names and environment-specific seed UUIDs must not become hardcoded policy identities. Specific
Choir Position grants are deferred, so no semantic-key migration is introduced now.

## Policies available against today's schema

All policies require a currently active User with a freshly validated session. Admin is a
specific source of grants, not a universal bypass. Unknown actions and invalid/missing resource
IDs deny access. Discarded Posts are inaccessible through the policy interface.

| Request | Grant |
| --- | --- |
| `post.create` | Any active User may create/publish personal content; no organisational grant required |
| `post.read` | Published Posts are readable by active Users; private Drafts only by their author |
| `post.update` | Own Draft; published personal content by its author or an Admin |
| `post.publish` | Own live Draft |
| `post.unpublish` | Published personal content by its author or an Admin |
| `post.discard` | Own live Draft |
| `group.publishPost`, `group.manageContent`, `group.manageEvents` | Admin, or a current Position holder with current Membership in that exact active non-Choir Group |
| `group.manageMemberships`, `group.managePositions` | Admin, for an existing active Group |
| `org.manage`, `user.administer`, `notification.broadcast`, `admin.access` | Explicit Admin grants; feature-specific safeguards still apply |
| `member.read` | Active Users may read other active Users' shared profiles |
| `member.readEmail` | The profile owner only; Admin has no shared-profile email bypass |
| `member.editProfile` | The profile owner, outside support impersonation |

The Group requests express authority to represent a Group. They are **not** permission to read
another author's private Draft, update an arbitrary Post ID, change any Event, or read a
Conversation. Resource instance policies must verify the resource's owning/organiser Group.
Choir publishing and Event management stay Admin-only for now. No grant propagates through
`choirId`, between linked Position holdings, or from the Board to unrelated Groups.

`post.*` currently operates on the existing personal Post schema. Group attribution, targets and
recall require the coordinated feature change below. `user.administer` does not replace Better
Auth's native account permissions, self/final-Admin protections or target-specific validation.

## Identity, freshness and concurrent writes

`getFreshRequestSession()` bypasses Better Auth's five-minute cookie cache. It remains centralized
in `core/auth/session.server.ts`, preserving the architecture rule on direct session calls and
the `io()` prerender gate. It is not React-cached. Authorization also reloads the effective User,
including `banned` and roles: a surviving stored session must not authorize an Inactive User.
The returned actor preserves `impersonatedBy`; this is attribution, not permission to assume
the impersonating Admin's grants. Existing self-profile and Messaging restrictions remain.

Passing `tx` shares transaction visibility, not serialization. Adoption must define lock order
with the feature's existing persistence and permission-changing commands:

- Post commands currently use single conditional SQL statements. Preserve their starting-state
  predicates and introduce a transaction/row locking or an equivalent conditional update when
  record authorization is added. Check the row state that will actually be written.
- Org Membership/Position changes take `org-structure:user:${userId}` advisory locks; Group
  structure checks use row locks against archiving. Group-authorized commands must coordinate
  with those writers, not merely re-read holdings before an unrelated write. Review the existing
  handover lock ordering before introducing any new lock sequence.
- Profile writes already lock the effective User with `FOR NO KEY UPDATE` against deactivation.
  Keep that protection when introducing central checks.
- Messaging sends and Membership changes serialize on the Conversation; timeline/read-marker
  reads protect the departure cutoff with a shared Conversation Membership lock. Preserve
  authorization callbacks inside those locked operations.
- Better Auth account mutations have their own transactions. An application transaction around
  a preliminary guard does not make a later Better Auth API call part of it.

No check is a durable grant for a later operation. Fresh session reads likewise do not hold a
session/User lock until a write commits. Each migrated command must decide and test its
coordination with session revocation and deactivation rather than claim atomicity from `tx` alone.

## Posts: migrate existing personal workflows first

| Where | Required adoption |
| --- | --- |
| `src/features/posts/compose/actions.ts` — `createPost`, `saveDraft`, `discardDraft`, `editPublishedPost`, `unpublishPost` | Replace the private coarse `authorize` gate with the matching `post.*` resource request; derive author from the returned actor |
| `src/features/posts/lifecycle.ts` — matching commands | Preserve author/live-Draft/published/discarded SQL predicates; coordinate resource authorization with the actual write |
| `src/features/posts/service.ts` — `listNewsFeed`, `getPublishedPost` | Add an active request actor at the protected read entry; currently these helpers rely on route authentication |
| Same — `listDraftsByAuthor`, `getEditablePost` | Derive the reader/author from trusted server context; apply record policy before returning content |
| `src/features/posts/news-screen.tsx` — `NewsScreen`, `OwnDrafts` | Use `post.create` for compose availability and derive own Draft identity from the actor |
| `src/features/posts/post-screen.tsx` — `PostControls` | Use the particular Post's update/unpublish capability |
| `src/features/posts/compose/EditPostScreen.tsx` — `mayEdit` | Replace create/update global grants with per-record checks; preserve 404 behavior |
| `src/core/auth/route-access.ts` — `/news/new` | Align composition-route availability with personal publishing; retain authoritative checks inside reads and commands |

This migration changes behavior: ordinary active Users may author personal Posts and edit
their own published work. It must replace UI and mutation gates together. Expand
`posts/compose/actions.test.ts` and `posts/lifecycle.test.ts` for other-author denials, direct
action submission, stale lifecycle state, impersonated actor attribution and private Drafts.

### Then add Group attribution, targeting and recall together

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

## Members and self-profile

- `src/features/members/query.ts`: `getProfile`, `getProfileEditor`, `getDirectory` already derive
  a viewer. Introduce fresh active identity there; preserve inactive-viewer 404 mapping.
- `src/features/members/service.ts`: `getMemberProfile` and `listMemberDirectory` already call
  `requireActiveViewer`. Replace duplicated identity/status policy only when the central check
  is at the same protected read seam. Keep active-target filtering and minimal directory columns.
  `member.read` does not permit email: `member.readEmail` applies before returning that field.
- `src/features/members/edit-profile/actions.ts`: `saveProfileAction` derives actor/impersonation;
  never obtain either from form fields.
- `src/features/members/edit-profile/service.ts`: `saveOwnVoiceCapabilities` should use
  `member.editProfile` within its transaction, retaining active-User locking and validation.
  `getOwnVoiceCapabilities` stays self-only. Keep `features/voice/capabilities.ts` independent of
  request identity; callers of `setVoiceCapabilities` must establish authority.
- Extend existing service/action tests for self versus other, Admin privacy, impersonation,
  inactive targets and a deactivation race. Existing self-profile policy is intentionally narrow;
  it is not permission to change every property of the User record.

## Organisational administration

Keep structural commands independent of request sessions so larger transactions and operational
workflows remain possible. In `src/features/org-structure/ui/run-command.ts`, replace the current
`requireAdmin` at `runGroupCommand` with the appropriate explicit Admin policy. Do not use the
ordinary Position-holder Group grants to administer Memberships or appoint Positions.

`ui/groups/actions.ts` handles creation/rename/archive; `ui/catalogue/actions.ts` handles Position
creation/update; `ui/detail/actions.ts` handles Memberships, Voices and holders. Use `org.manage`
for catalogue/structure operations and exact-Group `group.manageMemberships` or
`group.managePositions` for the corresponding existing Group operations. New Group creation
cannot be authorized by a nonexistent Group ID.

Protected screen reads currently rely on Admin route pages. Add explicit protected read-entry
guards to `ui/choirs/query.ts/getChoirPlacement`, `ui/groups/query.ts/getGroupsOverview`,
`ui/detail/query.ts/getGroupDetail` and `getChoirIdOf`, and
`ui/catalogue/query.ts/listPositionCatalogue`. `ui/group-summaries.ts/listGroupSummaries` must
only be reached from authorized screen queries or establish the same boundary itself. Ordinary
org read helpers remain reusable fact reads, not arbitrary-user administrative screen endpoints.

Keep the existing command results, transactions/savepoints, advisory locks and invariant tests.
Expand `ui/actions.test.ts` to show that an ordinary Position holder still cannot administer
Memberships/Positions. Stage one makes no changes to these workflows.

## User management and notification broadcast

- `src/features/user-management/service.ts/listUsers` currently relies on its Admin route.
  Establish `user.administer` at the protected read entry before returning account metadata.
- `user-management/actions.ts`: `activateUser`, `deactivateUser`, `eraseUser`,
  `resendInvitation`, `changeUserRole`, `impersonateUser` need fresh explicit administrative
  authority. Preserve self/final-Admin restrictions, inactive-before-Erasure, literal confirmation
  and impersonation target checks. Better Auth must still enforce its own native grants.
- `user-management/invite-user.ts`: `inviteUser`/`inviteUsers` are the shared invitation seam
  used by `add/actions.ts` and `import/actions.ts`; avoid checking only the dialog. Protect
  `import/actions.ts/findExistingUserEmails` as a sensitive read as well as `importUsers`.
- `src/features/notification-broadcast/actions.ts`: replace the three Admin guards on
  `sendTestNotificationToAll`, `searchUsersWithSubscriptions`, `sendTestNotificationToUsers`
  with `notification.broadcast`. Subscription search is protected even though it does not send.
- Preserve and extend the existing action tests; central capabilities never bypass native API
  restrictions or feature lifecycle safeguards.

## Messaging: preserve membership and history semantics

Organisational Group grants give no Conversation access. Do not replace Conversation Membership
or a departure cutoff with a generic `canRead` boolean. The first adoption can use central fresh
identity while keeping the established transactional Conversation authorization. If policies later
move into core, move the complete rule and its tests, including the readable Message range.

| Where | Preserve while adopting |
| --- | --- |
| `ui/inbox/query.ts` — `listConversations`, `listDirectConversations` | Viewer-based SQL filtering, departure cutoffs for previews and unread counts |
| `ui/conversation/query.ts` — `getConversationPage` | Direct-pair membership; shared lock on Group Conversation Membership and cutoff; current member list hidden from former members |
| `ui/conversation/read.ts` — `markConversationRead` | Signed read token, pair/membership checks and cutoff inside its transaction |
| `sending/send-message.ts`, `sending/start-direct-conversation.ts` | Derive sender from fresh identity; preserve recipient availability and existing transaction behavior |
| `sending/append-message.ts` — `appendMessage` | Authorization after Conversation locks and before retry lookup/append, via `authorizeWhileLocked` for Groups |
| `group-conversations/commands.ts` | Active Conversation Membership for add/rename/leave, Conversation locks and creation idempotency |
| `ui/inbox/member-search.ts` — `searchMembers` | Active-other-User search; returning a destination does not authorize a Conversation |
| `reading/find-direct-conversation.ts` | Lookup accepts only trusted authenticated caller IDs and grants no access by itself |

`ui/message-command-access.ts/requireMessageSendingAvailable` currently blocks impersonation at
the outer action seam for `startConversationAction`, `sendMessageAction` and
`groupConversationAction`. Preserve that rule when strengthening lower-level request entrypoints.
Do not claim it already guards all Messaging operations: read-marker and member-search actions
currently rely on other checks and ordinary route navigation blocks impersonation. The adoption
must cover direct action calls, not merely hidden pages. Retain command, departure/read-lock,
idempotency and recipient-deactivation tests.

## Routes, navigation and remaining surfaces

`src/proxy.ts` and `core/auth/route-access.ts` provide early navigation gates, not authority for
data access or Server Actions. `/api` is excluded from the proxy matcher; Better Auth's catch-all
handler enforces its own native permissions. `(app)/layout.tsx` adds navigation without an auth
guard. Do not rely on either layout or proxy as a substitute for protected read/write checks.

Align Admin page guards under `src/app/[locale]/(app)/admin/` and
`core/navigation/app-navigation.tsx` with explicit capabilities when their workflows migrate.
Retain cheap/cache-backed route presentation where appropriate; fresh guards at protected seams
remain authoritative. Do not perform per-resource authz queries from the proxy.

Account passkeys, passwords, sessions, username, email verification and 2FA primarily use Better
Auth client endpoints. Keep native authentication/ownership checks there. Local server actions
in `features/account/settings/profile/actions.ts` (locale) and
`settings/notifications/push-notification-actions.ts` (subscriptions and self test) derive their
own User identity; use fresh active identity when adopting authz. They currently lack the
self-profile impersonation restriction: do not silently broaden that policy during this stage.

`features/events` currently contains schema tests only. Future Event instance policies must bind
management to `organiserGroupId`, separately from audience and `createdBy`. Non-Choir organiser
Position holders can manage that organiser's Events; Choir grants remain Admin-only. Do not adopt
the Events schema's broader Choir/subgroup/target-based authority without revisiting the decision.
Keep field-level rules for Response reasons and Registration answers, and Section-scoped
Stämförälder attendance authority, explicit when those features are implemented. Rich text itself
has no independent protected persistence workflow.

## Future organisational period change: always coordinated

Today, both org-structure and authz mean **`endDate IS NULL`**. A future start grants current
status immediately. A future end removes current status immediately. Stage one preserves those
consequences and adds contract tests; it does not introduce a shared period helper or reinterpret
dates inside authz alone.

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
