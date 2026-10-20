# Application authorization

`@/core/authz` decides whether the current actor may perform an action using typed resource
and relationship attributes. Features supply facts from trusted server reads; authorization
owns the decisions. Better Auth retains authentication and its native account permissions.
The module never imports features and does not load their resources itself.

Personal Post creation, reads and lifecycle commands use this module. Features load and lock
Post attributes before checking their resource policy. Other feature migrations are tracked in
the adoption guide.

## Reading order

| File | Read it to understand |
| --- | --- |
| `README.md` | Calling the module and adding policies |
| `model.ts` | The action catalogue, required resource facts and policy types |
| `post-policies.ts`, `group-policies.ts`, `member-policies.ts`, `admin-policies.ts` | The permission rules for each subject |
| `policy-registry.ts` | Static registration and pure policy evaluation |
| `authorization.ts` | Fresh actor resolution, operation snapshots and denial errors |
| `index.ts` | Production wiring and the application entrypoint |
| `policies.test.ts` | Examples of grants, denials and policy exceptions |

## Calling the module

```ts
import { can, requirePermission } from "@/core/authz"

const mayCreate = await can({ action: "post.create" })
const mayEdit = await can({ action: "post.update", context: { post } })
const actor = await requirePermission({ action: "post.update", context: { post } }, tx)
```

`PermissionContext` in `model.ts` declares the facts for every action. `PermissionRequest` is
a discriminated union: the action determines its context, and unrelated or missing context
fails typechecking. Context-free actions need only their action name. A null resource denies
access. Types and minimal attribute projections are available through `@/core/authz/model`
without importing the server entrypoint.

Supply resource attributes such as `authorId` and `publishedAt`, not a decision such as
`isOwnerOrAdmin`. Group work requires the Group, Membership records and Position holding
records. Policies match each relationship's User and Group and decide whether it is current;
callers must not turn a holding or membership fact into a separate permission fallback.
Membership/holding periods currently mean `endDate === null`, including future start dates.
Archived Groups deny Group operations even when their relationships remain current.
Existing org-structure summary reads omit some required identity/period fields. Group policy
adoption must extend or add focused read helpers there to supply the complete attributes.

Context is a trusted server contract, not a runtime validator for browser payloads. Validate
incoming IDs/content and load authoritative resource facts before calling authorization. Never
accept submitted ownership, roles, Memberships or Position claims as these facts. Authorization
resolves the actor itself, bypassing Better Auth's cookie cache and reloading current User
role/status; features cannot supply an actor to the server interface. Impersonation attributes
refer to the effective User and preserve the support actor only for attribution.

`can` returns false for expected denials. `requirePermission` evaluates the same policy and
returns `{ userId, isAdmin, impersonatedBy }` or throws `AuthorizationDeniedError`. Session and
database failures propagate. Unknown runtime action names deny access. Error diagnostics contain
the actor and supplied context: keep them on the server and map denials to the feature's existing
localized errors or 404 behavior without serializing these details.

## One server operation with multiple checks

`forCurrentRequest(tx?)` resolves one immutable actor snapshot. Its `can` and `requirePermission`
methods are synchronous evaluations using that snapshot and the supplied facts:

```ts
import { forCurrentRequest } from "@/core/authz"

await db.transaction(async (tx) => {
  const access = await forCurrentRequest(tx)
  // A feature-owned loader reads and locks the resource as required by this operation.
  const post = await loadPostForUpdate(tx, postId)
  const actor = access.requirePermission({ action: "post.update", context: { post } })
  // Apply the feature command with actor.userId for attribution and preserve its state predicates.
})
```

`access.actor` is null without an active authenticated User; both methods deny in that case.
Otherwise its ID can be used to load actor-specific facts. The snapshot belongs to one operation:
do not cache it, store it in module state, pass it to a client, or reuse it for another request or
write. Standalone `can`/`requirePermission` resolve a fresh actor on every invocation.

A transaction shares visibility but acquires no authorization locks by itself. The feature
coordinates reads/checks/writes with resource updates, deactivation, Membership departure and
other permission-changing commands. Keep existing lifecycle predicates and lock ordering.
Neither a snapshot nor a successful `can` is a durable grant. Rendering callers still need
Suspense and must keep actor resolution outside Next.js cache scopes.

## Editing policies

Policies are ordinary synchronous TypeScript functions with boolean expressions:

- `post-policies.ts`: personal Post creation, reading and lifecycle permissions.
- `group-policies.ts`: exact-Group representation and administration.
- `member-policies.ts`: shared profiles, private email and self-profile edits.
- `admin-policies.ts`: explicit administrative grants.

Each function receives the actor and the context declared for its action. `policy-registry.ts` evaluates
the matching function; null actors deny before any policy runs. There is no implicit Admin bypass
or predicate-composition interface. Private Drafts remain author-only even against Admin.

### Adding an action to an existing family

1. Add the action and its required facts to `PermissionContext` in `model.ts`. Use `undefined`
   for context-free actions. The `PermissionAction`, `PermissionRequest` and `AuthorizationPolicies`
   types derive from this catalogue; they do not need separate entries.
2. Add a synchronous policy function to the matching `*-policies.ts` file and map the exact
   action name to it in that file's exported policy object. Post, Group and Member maps use
   `satisfies Pick<AuthorizationPolicies, ...>` to require every action with their prefix.
   `adminPolicies` lists its action names explicitly; extend that list when adding a grant there.
3. Cover grants and denials through `evaluatePermission` in `policies.test.ts`, including missing
   resources, other actors, relevant resource states, Admin and impersonation behavior.
4. Run `bun test src/core/authz/policies.test.ts` and `bun run typecheck`. The latter includes
   `test/authz.typecheck.ts`, which checks action/context correlation and registration contracts.

For example, the existing `post.publish` action connects these declarations:

```ts
// model.ts — entry inside PermissionContext
"post.publish": PostContext

// post-policies.ts — policy implementation
function canPublishPost(actor: AuthorizationActor, { post }: PermissionContext["post.publish"]): boolean {
  return post !== null && post.discardedAt === null && post.publishedAt === null && post.authorId === actor.userId
}

// post-policies.ts — entry inside the exported postPolicies object
"post.publish": canPublishPost
```

`postPolicies` is already included in `policy-registry.ts`, so adding another Post action does
not require editing the registry. Missing policies fail typechecking.

### Adding a policy family

Follow the action steps above, creating a `<subject>-policies.ts` file with its typed policy map.
Then import that map into `policy-registry.ts` and spread it into the `policies` object, alongside
the existing families. Keep each action in exactly one family: object spreads overwrite duplicate
keys in order. Registration is explicit static composition; there is no runtime registration or
file discovery. Add the new family to the reading order and policy list above.

### Resource changes and feature adoption

New operations that change authorization-relevant fields must include the proposed values in
their context and check those values in the policy, as well as the existing resource. Current
Post policies do not implement Group attribution, audience changes or recall, and Group work
grants do not authorize arbitrary Post or Event instances.

## Tests

`policies.test.ts` exercises the pure evaluator with attribute fixtures and needs no database.
`test/authz.test.ts` uses a migrated disposable local PostgreSQL database for trusted actor
resolution, transaction visibility, attribution, errors and organisational period compatibility.
`test/authz.typecheck.ts` checks invalid action/context combinations and policy registration
through `bun run typecheck`.

`createAuthorization({ database, readSession })`, imported directly from
`@/core/authz/authorization`, is the internal server composition seam for those tests and for
`index.ts`. The application entrypoint `@/core/authz` exposes `can`, `requirePermission`,
`forCurrentRequest`, denial errors and caller-facing types; it does not re-export the factory.
Production wiring supplies the application database and `getFreshRequestSession`. Never use
the factory to accept browser-supplied identity.
