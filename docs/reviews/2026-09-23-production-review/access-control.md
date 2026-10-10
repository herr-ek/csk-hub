# Application-owned access control

[Review index](README.md) · Canonical defects: [AUTH-004](authentication.md#auth-004), [AUTHZ-001](architecture-operations.md#authz-001), [AUTHZ-002](architecture-operations.md#authz-002), [ARCH-001](architecture-operations.md#arch-001). This is a proposed target, not an accepted ADR.

## Recommendation

Use a small application-owned policy module, explicit User/Admin roles, and descriptive policies. Better Auth establishes identity and implements authentication mechanisms; application policy decides what the actor may do to a specific resource. Retain Better Auth's Admin plugin only for deliberately selected mechanisms/grants. Do not use its broad default grants as the application's product definition.

There is already a central global permission table in `core/auth/permissions.ts`. The problem is not simply missing centralization: that table cannot express self/target/activity/impersonation constraints, and separate native endpoints bypass the app's checks. The current `canCurrentUser` also reaches back into the identity provider for an application decision and loses session-validity context. Replace those limitations incrementally, without first building a generic authorization framework.

Every Admin remains a User. Keep current persisted `admin` and `user,admin` representations compatible at the identity adapter; normalize them to one application role contract. Unknown roles must not gain authority. Decide and test any compatibility default for legacy null roles explicitly. Do not add Choir/organization memberships or a generalized role editor in this pass.

## Small module shape and dependency direction

```text
core/auth                 Better Auth configuration, supported hooks, native endpoint adapter
core/access/policy.ts     pure Actor/target summaries, User/Admin and account policies
core/access/actor.server  authoritative request session → minimal Actor
core/access/require.server  typed assertion/denial helpers, if they hide repeated behavior
features/user-management  target loading + transactional lifecycle commands
features/messaging       Conversation Membership policies + protected queries/commands
features/posts           Post policies + protected reads/publish
features/notification-broadcast  audience authorization
core/notifications       validated subscription storage + delivery eligibility/transport
```

`core/access` is proposed; adapt names to existing conventions if the same ownership stays clear. Pure policies must not import the auth singleton, database, Next, or feature implementations. The request actor loader may import `core/auth`; auth hooks import only pure policies and map their own authoritative library context. This avoids `auth → actor loader → auth` initialization cycles. Resource-specific policies stay with their feature and can use the shared Actor type. Core never imports a feature to decide a Conversation rule.

Keep guarded server entrypoints separate from universal policy types. A policy does not need an interface/adapter hierarchy merely to support a single implementation.

## Suggested interfaces

```ts
// Conceptual contracts, not implementation to paste unchanged.
type Actor = {
  actorUserId: string       // real operator
  effectiveUserId: string   // User whose session is being presented
  roles: ReadonlySet<'user' | 'admin'> // effective roles; never union operator privileges
  active: boolean
  impersonating: boolean
}

getRequestActor(): Promise<Actor | null> // validates current session and active state
canManageUsers(actor): boolean
canInviteUser(actor): boolean
canChangeUserRole(actor, target): boolean
canActAsUser(actor, target): boolean
canManageOwnCredentials(actor): boolean
canPublishPost(actor): boolean

// Feature command owns target reads, authoritative enforcement, invariants and write.
changeUserRole({ targetUserId, roles }): Promise<UserManagementOutcome>
sendMessage({ conversationId, text, idempotencyKey }): Promise<SendOutcome>
```

Acquire the actor from request/session context, never from a submitted actor ID/role. Prefer disabling the cross-request cookie cache for this scale; request-local memoization can avoid repeated lookups. Pass the trusted Actor internally where useful, without exposing raw auth tokens or trusting client-supplied capability flags.

`canChangeUserRole` answers actor/target eligibility. The command still has to preserve the final-active-Admin invariant transactionally; a precomputed count passed to a pure predicate is not sufficient concurrency control. Locking/revalidation belongs with persistence, not in a UI boolean. Messaging's current send interface already hides the appropriate transaction complexity and should be retained.

## Initial policy matrix

| Operation | Proposed rule | Owning enforcement |
| --- | --- | --- |
| Read News feed/Post | Current active User, including Admin | Post read boundary |
| Publish Post | Current active, non-impersonating Admin | Post command |
| List/manage/invite Users | Current active, non-impersonating Admin | User-management read/commands |
| Change role/deactivate | Above + allowed target + self prohibition + preserve final active Admin | Transactional lifecycle command |
| Act as User | Above + different active non-Admin target | User-management/auth adapter |
| Private Conversations, send/search/read marker | Current active real User + feature membership/target rules; impersonation denied | Messaging read/command boundaries |
| Manage own credentials/devices | Current active real User, with library freshness/re-authentication requirements | Native auth hooks and app adapters |
| Register push subscription | Current active real User + validated endpoint + explicit browser binding | Account/notification boundary |
| Broadcast | Current active, non-impersonating Admin + validated audience; eligible active recipients | Broadcast action and delivery selection |
| End impersonation | Valid supported impersonation/original-session protocol, including on denied screens | Native auth adapter + navigation |

This matrix assumes impersonation is a support capability, not authority to acquire target credentials. Ratify that decision before broad policy migration. The default exclusion of impersonated publishing/broadcast is consistent with effective User permissions today; do not accidentally reintroduce the real Admin's privileges into the target session.

## Enforce through every surface

1. **Reads and commands:** identity and resource rules at the server module that owns the operation. Thin actions and route handlers parse untrusted input and map outcomes. Page/proxy checks may improve navigation but are not a security substitute.
2. **Native auth HTTP endpoints:** make an explicit inventory of enabled plugin paths. `disabledPaths` can close an unwanted HTTP route while server API calls remain available in installed 1.7.4; verify this with the real plugin integration. Where both paths are needed, use supported hooks/adapters that enforce the same pure policy. Do not import private `node_modules` middleware as application API.
3. **Native Admin operations:** review both dedicated setters and generic update-user; disabling only set-role leaves another write path. Restrict unnecessary password/email grants. Preserve Better Auth's authoritative session, ban/session-revocation and credential protections when replacing an entry point. Erasure remains a separate workstream.
4. **Activation and OTP:** keep intended email verification and Admin-issued activation working while closing public registration/email-only sign-in. Scope the magic-link verification lifecycle so an old activation capability cannot become accidental recovery after 2FA setup. Never globally disable verification without preserving Invite activation.
5. **Client UI:** derive capability flags or use pure policies over safe summaries for visibility/explanations. These are hints; the server rechecks. Always keep an escape from impersonation. No client user ID, hidden field or cached boolean is authority.

## Outcomes and disclosure

| Internal outcome | Meaning | Presentation/protocol |
| --- | --- | --- |
| `sign-in-required` | No current valid session | Redirect for navigation; explicit action result; 401 for an API |
| `forbidden` | Authenticated actor lacks permission | Localized 403/denial, with safe navigation |
| `invalid-input` / `invalid-target` | Malformed request or prohibited target relationship | Field/domain feedback; no write |
| `resource-unavailable` | Missing/inactive/unavailable permitted target | Explain to authorized Admin; conceal existence where private-resource enumeration matters |
| `service-unavailable` | DB/auth/provider failed to answer | Retry/reconciliation guidance and sanitized operational event; never reinterpret as forbidden |

For private Conversations, collapse unauthorized existence detail at the transport edge where necessary, while retaining useful internal error kinds. Expected policy failures are values/typed errors, unexpected failures remain distinguishable. Avoid returning arbitrary exception messages to clients. For operations that may already have committed, return a completed/uncertain state and reconcile instead of inviting a blind retry.

## Library comparison

| Option | Fit here | Maintenance and integration tradeoff | Decision |
| --- | --- | --- | --- |
| Small pure application policies | Two coarse roles, a few target/membership rules, explicit impersonation | A modest policy matrix and ownership discipline; ordinary TypeScript and existing Drizzle transactions | **Recommended** |
| Better Auth access-control statements | Useful for native plugin's global user/session grants; already installed | Does not itself enforce resource state, target relationships, lifecycle atomicity or all app entry points; retaining it for app rules couples product policy to identity provider | Keep as restricted native adapter, not sole product policy |
| CASL | Useful when subject/field/conditional rules and shared UI abilities become substantially richer | Additional rule model, subject typing and framework integration; Drizzle query scoping/transaction invariants still need app-owned work | Revisit only for demonstrated complexity; do not add now |

Better Auth's [Admin access-control documentation](https://better-auth.com/docs/plugins/admin#access-control) describes its resource/action grants. [CASL's primary README](https://github.com/stalniy/casl) describes action, subject, condition and field rules. These are library capabilities, not automatic enforcement of this app's invariants. An external policy server or organization plugin would add deployment/data-model complexity without solving a demonstrated need for this single association; it is not proposed.

## Migration sequence

1. Close AUTH-001/AUTH-002 and unwanted alternate sign-in paths without waiting for a module reorganization.
2. Introduce authoritative Actor acquisition, preserving impersonation, and tests for revocation/demotion/activity. Fix native impersonation credential exposure in the same security slice where feasible.
3. Move one vertical User-management workflow to descriptive policy + command, including all native HTTP alternatives and transactional invariants. Keep compatibility at old call sites temporarily; avoid two competing authorities.
4. Adopt the Actor in messaging private reads/sends, Post reads/publish, then notifications. Reuse existing local membership/transaction code; do not centralize all resource queries in core.
5. Align navigation/error outcomes and remove obsolete generic provider permission calls once no caller relies on them. Document the agreed target in a short ADR through the team's normal process.

Acceptance is direct server/native-endpoint enforcement, not the disappearance of buttons. Use focused policy tables, disposable handler tests and a small number of browser/DB scenarios that protect the actual boundaries.
