# Authorization design and feature adoption

This guide records the authorization discussion and the exact seams for adopting `core/authz`.
The implemented boundaries and remaining capabilities are described below. The
[authz README](../src/core/authz/README.md) owns the calling contract, reading order and steps
for registering policies.
The architectural decision is drafted in
[ADR 0007](adr/0007-application-authorization-uses-domain-policies.md); it remains proposed,
subject to the team discussion required by CONTRIBUTING.md.

## Delivery status

1. **Core policies — implemented.** `src/core/authz` owns code-defined action/resource policies,
   trusted fresh identity and typed resource attributes supplied by features. It never imports features.
2. **Personal Posts — implemented.** Active Users can publish as themselves. Author/Admin policies
   protect published work; private Drafts stay author-only. Reads, commands, routes and UI agree.
3. **Existing feature adoption — implemented.** Members, Messaging, organisational administration,
   User management, notification broadcast and local account settings use fresh central authority.
   Native Better Auth account endpoints retain their own permissions.
4. **Group Posts — implemented.** Group attribution, audience targeting, Recalled Group Posts,
   and current representative handover use the Post policies. See the [Post access guide](../src/core/authz/POLICIES.md).

There are no schema changes or organisational period changes in stages two and three.
`core/auth/permissions.server.ts` and the cached identity-only guard are removed. Better Auth's
statements now contain only native User/Session grants, without an application Post fallback.
The glossary includes future domain behavior; it does not imply all that behavior is implemented.

Application impersonation has been removed: there is no User-switching action, navigation state
or feature-specific impersonation rule. Native Admin role grants exclude impersonation, so the
Better Auth endpoint cannot start it. The Better Auth plugin setup and its Session schema remain
unchanged; no database migration is required. Authorization actors contain only `userId` and
`isAdmin`.

## Responsibility and interface

Features import `@/core/authz`; authorization imports `core/auth`, `core/db` and generic shared
helpers, never features. Authorization declares minimal attribute types derived from database
schemas, resolves a fresh session and reloads the current User's role/status. It does not load
Posts, Groups or Position appointments. Features load those facts through trusted server
reads and supply them as context. Organisational reads use org-structure's read helpers and writes
still go through its commands. Document validation, lifecycle predicates and Conversation
history remain feature-owned.

```ts
import { can, requirePermission } from "@/core/authz"

const mayEdit = await can({ action: "post.update", context: { post } }) // UI hint only

await db.transaction(async (tx) => {
  const post = await loadPostForUpdate(tx, postId) // Feature-owned trusted read and lock.
  const actor = await requirePermission({ action: "post.update", context: { post } }, tx)
  // Persist with the feature's lifecycle predicates, attributing to actor.userId.
})
```

`requirePermission` returns `{ userId, isAdmin }` or throws
`AuthorizationDeniedError`. Never accept actor identity or ownership claims from browser input.
`can` uses the same policy but returns false for expected denials. Unexpected session/database
failures propagate. Map denials to localized feature errors or 404s without exposing the error's
server-side actor/resource diagnostics. Rendering guards require Suspense and stay outside caches.

`app.access` establishes fresh active identity for shared application workflows, including
Messaging. It does not grant Conversation access. Group policies accept Group and contextual Position appointment attributes from trusted feature reads. The policies determine relationship scope and
currentness; features must not substitute precomputed permission booleans. Fixed Position codes identify responsibilities; appointments identify the concrete context Group.
Do not hardcode translated titles or environment-specific seed UUIDs as policy identities.
Specific Choir Position grants remain deferred.

There are no standalone Membership/Position fact helpers in authz. The existing org-structure
helpers `listCurrentGroupsOfUser` and `listCurrentPositionsOfUser` return summaries, not complete
authz contexts: they omit some required identity/period fields. When adopting Group policies,
extend or add focused org-structure read helpers that expose the required attributes; do not
pass summary rows directly or replace missing facts with precomputed permission booleans.

## Policies against today's schema

Every policy requires a freshly validated session and active User. Admin has explicit grants,
not a universal bypass. Unknown actions and invalid/missing resources fail closed.

| Request | Grant |
| --- | --- |
| `app.access` | Any active User |
| `post.create` | Any active User may start a Post |
| `post.read`, `post.readAttribution` | Audience, authorship and management grants depend on the Post's state and publisher. Group creator/editor names are restricted. |
| `post.update`, `post.unpublish` | Author of a private Draft or personal Post, Admin for a published personal Post, or current representative/Admin for published or Recalled Group Posts. Recall requires a published Post. |
| `post.address`, `post.publish` | Applicable management authority plus valid publisher and audience selections at publication |
| `post.discard` | Author of a private Draft |
| `group.publishPost` | Admin or current Position appointee in the exact active non-Choir Group |
| `group.manageContent`, `group.manageEvents` | Admin for an active Group, or current Position appointee in the exact active non-Choir Group |
| `group.manageMemberships`, `group.managePositions` | Admin, for an existing active Group |
| `org.manage`, `user.administer`, `notification.broadcast`, `admin.access` | Explicit Admin grants; feature-specific safeguards still apply |
| `memberId.issue` | Active Users may present their own temporary ID |
| `memberId.verify` | Active Admins may verify a temporary ID |
| `event.*` | Exact organiser management and explicit Admin grants; see Events below |
| `member.read` | Active Users may read other active Users' shared profiles |
| `member.readEmail` | Profile owner only; no Admin bypass |
| `member.editProfile` | Profile owner |

Discarded Drafts are inaccessible. Post and Event instance policies bind management to the exact
publishing or organising Group. The [Post access guide](../src/core/authz/POLICIES.md) describes
the separate rules for selecting audiences, including Board and Choir exceptions.

## Freshness, locks and limitations

`getFreshRequestSession()` bypasses Better Auth's five-minute cookie cache, disables session
refresh and is not React-cached. Authz reloads the authenticated User's roles and `banned` status.
`getRequestSession()` remains suitable for presentation metadata, with ordinary refresh behavior.

`requirePermission(request, tx)` shares transaction visibility but acquires no authorization
locks. `forCurrentRequest(tx?)` resolves one actor snapshot for synchronous checks within one
operation; never cache or reuse it across operations. Fresh checks reject already revoked
sessions or deactivated Users, but do not serialize a later revocation/deactivation with a write.
Features must coordinate any stronger guarantees with their permission-changing writers.

Post operations take the actor's organisational advisory lock, then shared locks on their current
Membership Groups, any Group IDs selected in a write, and the owning Choirs of locked
Sections. Compose options are presentation hints.
Feed and detail reads share-lock candidate Posts and recheck readership against targets loaded
after the lock. Writing a read marker also rechecks visibility after locking the Post. Post commands
take `FOR UPDATE` on the Post before authorizing and writing. The guard and persistence predicates
both enforce the lifecycle rules.

Features retain their additional coordination:

- Profile writes take a User `FOR NO KEY UPDATE` lock before the transactional guard. Concurrent
  User-row writes must not both take shared locks and then try to upgrade them. Locale preferences
  live in their own table and retain their atomic partial-update behavior.
- Messaging keeps recipient locks, Conversation locks, Group Membership shared read locks,
  departure cutoffs and authorization callbacks before retry lookup/append.
- Org-structure retains savepoints, per-User advisory locks, archiving locks and invariants.
  Posts share the actor lock with Membership and Position changes and lock Groups in Choir-first
  order to coordinate with archival.
- Better Auth API mutations run their own transactions, and notification delivery is external.
  Their preliminary central checks do not make those later effects atomic with session revocation.

## Posts: implemented boundaries

| Seam | Current behavior |
| --- | --- |
| `posts/compose/actions.ts`, `commands.ts` | Actions validate input; commands load/lock Post facts, check the exact `post.*` request and persist in one transaction; actor comes from the guard |
| `posts/lifecycle.ts` | Low-level server persistence; caller must establish authority in the same transaction; author/state/discard predicates retained |
| `posts/service.ts/listNewsFeed` | Published Posts visible to the current reader |
| `posts/service.ts/listOwnDrafts` | Current author's private Drafts and Recalled Group Posts they can manage |
| `posts/service.ts/getPublishedPost`, `getEditablePost` | Guard and content read share a transaction/Post lock; forbidden or absent returns null |
| News, detail and compose screens | Resource capabilities shape controls; direct reads and action submissions check independently |
| `core/auth/route-access.ts` | Composition route available to authenticated Users; no per-resource queries in Proxy |

`posts/compose/actions.test.ts`, `posts/lifecycle.test.ts`, `test/authz.test.ts` and
`test/authz-adoption.test.ts` cover direct action denials, attribution, private Drafts, lifecycle
changes, serialization with unpublishing, and fresh checks after revocation/deactivation.

## Members and self-profile: implemented boundaries

`members/query.ts` establishes fresh active identity for directory/profile/editor reads. Shared
profiles require `member.read`; email is masked unless `member.readEmail` allows it. Edit controls
use `member.editProfile`. Active-target filtering, directory projections and existing inactive
viewer/target handling remain in the service.

`edit-profile/actions.ts` derives the authenticated actor. `saveOwnVoiceCapabilities` checks
`member.editProfile` inside the existing User-locked transaction before calling the Voice module.
The Voice capability primitives remain independent of request identity; callers must authorize.
These grants do not permit editing arbitrary User fields or reading others' email. Existing
service/action tests cover ownership, inactive Users and unauthenticated requests.

## Organisational administration: implemented boundaries

`org-structure/ui/run-command.ts` requires `org.manage` before parsing the form, then checks the
specific request inside the transaction used by the domain command. The retained structural, Membership/Voice and appointment operations all use `org.manage`
inside that transaction and remain Admin-only. Creating a Group does not
require a nonexistent Group ID.

Protected screen queries in `ui/choirs`, `ui/groups`, `ui/detail` and
`ui/group-summaries.ts` require `org.manage` themselves. Domain commands/read helpers remain
session-independent for composition and operations. The fixed catalogue and shared calendar clock determine dated participation.
Existing results, savepoints, advisory locks and invariant tests remain intact.

## User management and broadcast: implemented boundaries

`user-management/service.ts/listUsers`, invitation entrypoints, sensitive import lookup and all
administration actions require `user.administer`. Native Better Auth User/Session permissions,
self/final-Admin checks, inactive-before-Erasure and literal confirmation remain. Central policy
never bypasses them.

The three `notification-broadcast/actions.ts` entrypoints require `notification.broadcast`,
including subscription search. Notification infrastructure still owns delivery and subscriptions,
not feature authority or recipient selection.

## Messaging: implemented boundaries

Protected inbox/search reads, Conversation page reads, read markers, sends, Direct starts and Group
Conversation commands derive identity with `requirePermission({ action: "app.access" })`.
Transactional operations recheck through the same boundary inside their transaction. UI adapters
translate authorization denials to the existing localized sign-in error.

Conversation Membership remains the source of Conversation authority. Organisational Group grants
give no Messaging access. Direct-pair checks, recipient availability, Group authorization callbacks,
idempotency, signed read tokens, departure cutoffs and unread filtering remain unchanged. Former
Group Conversation members retain their allowed Message range without receiving a current member
list. The shared Direct lookup accepts trusted caller IDs and grants no access by itself.

Keep command, departure/read-lock, idempotency and recipient-deactivation tests. If these policies
later move into core, move the complete readable-range rule and its tests together.

## Routes and account settings

Proxy and `route-access.ts` use cheap cached-session presentation gates. Admin pages establish
`admin.access`; navigation uses fresh `app.access`/`admin.access` hints. Neither layout nor Proxy
replaces data/action guards. `/api` is excluded from Proxy; Better Auth's catch-all handler enforces
its own native endpoint rules.

Account settings rendering, locale updates, subscription writes and self push tests require
`app.access` and derive their actor. Locale and subscription writes check inside their database
transaction. Passwords, passkeys, sessions, username, email verification and 2FA continue through
native Better Auth endpoints.

## Events: implemented boundaries and policy gaps

The `/events/manage` management surface is available to active Users. Its collection is filtered in
SQL by authorised organiser Group IDs before loading Events, Targets or counts. `/events/manage/new`
creates a Draft and `/events/manage/[eventId]` edits it. The existing Admin routes remain available.
The member calendar stays at `/events` and `/events/[eventId]`.

The following policies are registered in `core/authz/event-policies.ts`:

| Policy | Grant |
| --- | --- |
| `event.create` | Admin, or a current Position appointment holder in the proposed exact active non-Choir organiser Group |
| `event.read` | Admin, or the same representation of the Event's actual organiser Group |
| `event.update` | Management of the current Event **and** authority over the proposed organiser, including clearing it |
| `event.changeStatus` | Event managers may publish, cancel or reinstate; the feature still enforces legal lifecycle transitions |
| `event.delete` | Event managers; the existing confirmation includes the deletion impact |
| `event.administer` | Admin-only shared Location catalogue and Admin route access |
| `event.scheduleRehearsals` | Admin, or a current Position holder in an active Board group; the rehearsal schedule tool |
| `event.view` | Admin/current manager, or a non-Draft Event's audience under the time rules below |

Management covers Draft, Published and Cancelled Events. `createdBy`, audience Targets, Choir
ownership and links to another Group confer no management authority. Choir organisers, missing
organisers and archived organisers are Admin-only, with the one exception below. An absent Event
denies even Admin. Admin may create an Event without an organiser, and may retain an archived
organiser on an existing Event; feature validation still refuses newly choosing an archived or
nonexistent Group.

### Exception: the Board schedules Choirs' Series Rehearsals

`event.scheduleRehearsals` holders (Admin, or a current Position holder in an active Board group)
manage a Rehearsal in a Series whose only Target is one whole Choir, so the Board can set up and
adjust each Choir's weekly rehearsals for a term without an Admin. The grant follows the Event's
type, Series and Targets, not its organiser: generated Rehearsals keep the Choir as Organiser
group, so nothing changes hands when a new Board takes over on 1 July. A Board update must leave
the Event such a Rehearsal under the same organiser; otherwise it needs authority over the proposed
organiser as before. Extra and Sectional rehearsals, and Rehearsals for several Choirs, stay
outside the grant. Conductors managing their own Choir's Rehearsals is a separate question (#168).

Event contexts therefore carry the Group catalogue and the Event's Targets, and Event operations
lock the actor's Board groups with the organisers. The rehearsal schedule tool lives at
`/events/manage/rehearsals`, since `/admin` admits only Admins.

Every Event action supplies trusted resource and relationship facts to its exact policy in the
same transaction as the domain command. The update context contains the proposed organiser facts.
The feature acquires org-structure's User advisory lock before Group archive locks and Event
locks, coordinating with Membership departure and Position handover. If an Event's organiser
changes during lock acquisition, the operation fails closed for retry. Collection and option
reads take relationship/archive locks too; instance reads hold an Event shared lock through
loading editor data. User deactivation and Session revocation retain the general freshness
limitation described above; the check does not serialize a later revocation.

`getEventEditor`, `getEventFormOptions`, `listManagedEvents` and `listLocations` establish their
own boundaries. Delegated pickers return User names and IDs, with no email fields; Admin pickers
retain emails. Organiser choices are restricted to manageable Groups; audience choices are
independent. Locations may be selected by delegates but created, edited or archived only by Admin.
Domain commands and low-level fact reads remain session-independent; callers must authorize.

`ui/access.test.ts` exercises real authorization and persistence: anonymous direct calls, exact
organiser scope, creator/Target non-grants, Choir restrictions, both sides of organiser changes,
lifecycle/deletion, attribution, email masking, departure/holding expiry/archival and lock
coordination. Core tests cover grants/denials and fresh rejection after Admin demotion,
deactivation and Session revocation.

### Agreed audience and participation rules

Audience Membership is evaluated at the **Event start**, including multi-day Events. Before that
instant, a Membership whose exclusive end has passed grants no access. Scheduled ends retain
visibility until their boundary.
At or after start, historical Membership remains a viewing grant after departure. Targets are
OR'ed; group/Voice filters within a Target are AND'ed. No Targets means every active User.
Cancelled Events retain audience visibility; Draft calendar pages stay hidden and managers
use their management page.

Stored Membership boundaries are dates, with inclusive starts and exclusive ends.
Checks use the Stockholm date of the start instant. The schema cannot distinguish departures
before versus after an Event start on the same calendar day. This change does not invent
timestamp precision or alter global organisational period semantics.

`calendar/query.ts` provides fresh protected collection/detail entrypoints using the same
`event.view` policy. Actor relationship locks serialize with departure, and Event shared locks
protect Targets/start/status. Low-level calendar queries accept trusted server actor facts
for composition/testing, never browser authority.

### Deferred participation workflows

Responses exist: answering requires `app.access`, and the Events module refuses anyone outside the
Audience (the shared `inAudience` rule) and any Event that is not Published, not in a response
mode or already started. Response comments and reasons are read only by their own User and by
Admins through `event.administer`; the full view for current Event managers is still future work.
Registrations and Attendance have no application workflows yet. Their policies and unused
data-access operations are deliberately deferred. Position identity uses the fixed catalogue and
contextual appointments; appointment-derived Memberships count toward Event audiences.

The following agreed rules are future-work requirements, not registered permission grants:

Response comments/reasons and registration comments/answers, including withdrawn registrations
and every answer kind, are accessible only to the submitting member, Admin and **current** Event
managers. Audience Membership and Section-parent attendance authority expose none of these fields.
Erased subjects have no self grant; Admin/managers may read retained non-identifying records.

Attendance is visible to the member, Admin and current Event managers. Additional Stämförälder
viewing/recording/correction authority applies **only to Rehearsal and Concert**, never Gig or
other types. The subject must have belonged to the editor's exact Section at Event start; the
editor must hold that Section's Stämförälder Position now. The holding must have begun and
remain open, and the Section must remain active. Holding the Position at Event time is
insufficient. Recording/correction requires a Published Event and an audience subject.
Existing records remain readable after cancellation but cannot then be changed.

The Events scheme's former broader Choir/subgroup/Target management examples are reconciled
with the exact-organiser rule. Choir-organised and organiser-less Events remain Admin-only, apart
from the Board's exception above.

Rich text has no separate protected persistence workflow.

## Stage four: Group attribution, targeting and recall

Implemented. The [Post access guide](../src/core/authz/POLICIES.md) is the human-readable
policy reference, including Section audiences, CSK-wide representation, Admin exceptions,
archival, handover, recall and attribution.

Posts store a separate publishing Group, immutable human creator, last editor, first
publication instant, explicit all-CSK flag, Group/Voice-family audience targets and a revision. Existing
published Posts retain personal identity and all-CSK audiences. First publication fixes
the identity; recall retains publication/editor history. Never-published Drafts remain private.

`post.address` checks proposed identity and audience facts independently of instance
management. All-CSK is available to every active Member. Otherwise the actor must belong
to every selected Group, belong to the owning Choir for a Section target, or publish for
the selected CSK-wide Group to address a whole Choir. Admin bypasses representation and
Membership, but never the Choir-publisher ban or active-publisher/target requirement.
Current representatives of an active Board may select any active Group audience, regardless
of publisher, without gaining additional Group representation, readership or editing rights.
`post.readAttribution` restricts Group creator/editor names to Admins and current representatives
of that exact publishing Group; feed and detail reads omit those names for other readers.
Voice-only targets are available to every active Member. Group/Voice criteria within a target
are AND'ed and targets are OR'ed. Post Voice-family matching uses current Section assignment
voices with Choir/Section scope, separately from Event start-time policy. Self-reported voice
capabilities remain deferred to #159.

Post operations use `withCurrentRequest` to validate the session before leasing a transaction
connection, then reload the User inside the transaction and reuse one actor snapshot.
This avoids pool starvation from session lookups while relationship locks are held.
Writes recheck current policies and reject stale revisions before changing content, targets
or state. Feed, detail and unread queries share a database visibility predicate. Audience
Membership is current, and personal authorship and current Group management supply separate
access grounds. Archived audience Membership preserves historical reading.

## Organisational periods and appointments

Org-structure and authz use Stockholm calendar dates with `[startDate, endDate)` periods.
A prepared future start confers no current status; a future end retains current status until
that exclusive boundary. The shared `cskToday()` clock keeps both modules on the same date.
Group policies require a current appointment in the exact context Group. The catalogue either
grants context Membership or requires independent Membership covering the tenure, so a separate
Membership input is unnecessary. Derived Membership in another Group grants no representation authority.
