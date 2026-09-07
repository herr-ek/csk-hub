# Permissions

CSK Hub currently has a deliberately small, role-based permission model. This
is the guide for using the existing model; it is not a commitment to its shape
when the wider authorization rewrite happens.

## Current model

There are two access roles, defined in
[`src/shared/roles.ts`](../../shared/roles.ts):

| Role | Meaning | Grants |
| --- | --- | --- |
| `member` | The baseline role for every account that can use the Hub. | Better Auth's ordinary signed-in-user permissions. |
| `admin` | An additional role for Members who administer the Hub. | Better Auth's admin permissions, in addition to member access. |

An Admin is always a Member. When roles are changed through member management,
the stored role list is normalised to either `["member"]` or
`["member", "admin"]`; do not create a separate population of admin-only
accounts.

The Better Auth plugin is configured in
[`permissions.ts`](./permissions.ts). It is the
single place to define access-control statements and which roles grant them.
`src/shared/roles.ts` owns role names and the tolerant parsing used for stored
roles (an array or a legacy comma-delimited string).

## Which guard to use

Authorization helpers live in
[`permissions.server.ts`](./permissions.server.ts).
It reads request headers and Better Auth's server API, so do not import it from
a Client Component.

| Need | Use | Result when denied |
| --- | --- | --- |
| Protect an admin server component, Server Action, or route handler | `await requireAdmin()` | Throws `AuthorizationDeniedError`. |
| Protect a future resource/action operation | `await requireCurrentUserPermission({ resource, action })` | Throws `AuthorizationDeniedError`. |
| Decide whether to render a non-sensitive affordance | `await isUserAdmin()` or `await canCurrentUser(...)` | Returns `false`. |

Use a `require…` guard at the entry point of every protected server operation.
Do not treat a hidden button, omitted navigation item, or client-side role check
as authorization.

```ts
"use server"

import { requireAdmin } from "@/core/auth/permissions.server"

export async function deactivateMember(/* input */) {
  const actor = await requireAdmin()
  // Validate input, then perform the protected work.
  // actor.userId is available for ownership checks or audit logging.
}
```

`requireAdmin()` and `requireCurrentUserPermission()` obtain the current
request's session when called without an argument. The optional session
argument on `requireAdmin(session)` and `isUserAdmin(session)` exists for
request adapters that already have a session, such as route access and
navigation. Prefer the no-argument form in application code.

## Routes and defense in depth

[`route-access.ts`](./route-access.ts) classifies
all routes:

- listed authentication routes are public;
- `/admin` and everything below it require an admin;
- all other app routes require an authenticated Member.

[`src/proxy.ts`](../../proxy.ts) applies that policy early, returning a login
redirect or a 403 before rendering. This is routing behavior, not the only
security control. Admin pages and mutations still call `requireAdmin()` so a
protected operation remains safe if it is reached outside the proxy path.

When adding a new top-level protected route, update `getRouteAccessPolicy` and
also guard the page's data loading, actions, and route handlers. A page guard
does not automatically protect a Server Action invoked by that page.

## Adding a permission before the rewrite

The generic permission helpers are ready for application resources, but no
custom resources exist yet. Add one only when a feature has an operation that
cannot be accurately expressed as member versus admin.

1. Add the resource and actions to `customStatements` in
   `src/core/auth/permissions.ts`, then spread it into `statements`.
2. Grant the appropriate statements in the relevant role definitions in the
   same file. Keep the Member baseline and Admin-adds-to-Member rule intact.
3. Protect the server operation with a literal request:

   ```ts
   await requireCurrentUserPermission({ resource: "group", action: "update" })
   ```

4. Add focused authorization tests for both an allowed and denied actor.

The request type is derived from `statements`, so TypeScript rejects unknown
resources and invalid action/resource combinations. Keep policy declarations in
`permissions.ts`; feature code should ask whether the current actor may perform
one declared operation rather than duplicate role comparisons.

## Related behavior

- Invites and ordinary account creation use the default `member` role.
- An inactive Member cannot sign in; inactivity is distinct from erasure. See
  [`CONTEXT.md`](../../../CONTEXT.md) and ADR 0003 for the product terminology.
- Admin role changes preserve at least one active Admin and prevent an Admin
  from changing their own role. Those workflow rules live in member management,
  not in the generic permissions module.
