import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import {
  type AccessRole,
  accessRoles,
  DEFAULT_ROLE,
  type PermissionAction,
  type PermissionResource
} from "@/core/auth/permissions"
import { ADMIN_ROLE, hasAdminRole, parseRoles } from "@/shared/roles"

type RequestActor = {
  userId: string
  roles: AccessRole[]
}

/**
 * The part of a Better Auth session an authorization decision reads. Callers that
 * already hold a session — the proxy, a layout — pass it in rather than paying for a
 * second lookup; passing `undefined` reads the session from the request headers, and
 * passing `null` states there is no session.
 */
export type PermissionSession = { user: { id: string; role?: string | null } }

/**
 * One resource-and-action pair drawn from the access-control table, e.g.
 * `{ resource: "post", action: "create" }`. The union is generated from `statements`,
 * so an action that a resource does not declare will not typecheck.
 */
export type GlobalPermissionRequest = {
  [Resource in PermissionResource]: {
    resource: Resource
    action: PermissionAction<Resource>
  }
}[PermissionResource]

/**
 * A `GlobalPermissionRequest` with nothing extra on it. Object literals widen to the
 * union too readily, so this pins the call site to exactly one resource-action pair.
 */
export type ExactGlobalPermissionRequest<Request extends GlobalPermissionRequest> = Request &
  Record<Exclude<keyof Request, keyof GlobalPermissionRequest>, never>

/** Who was asking, as far as a denial needs to record it. */
export type AuthorizationActorContext = { state: "authenticated"; userId: string } | { state: "unauthenticated" }
export type AuthenticatedAuthorizationActorContext = Extract<AuthorizationActorContext, { state: "authenticated" }>

/** What the actor failed to satisfy: a permission from the table, or a role outright. */
export type AuthorizationRequirement =
  | { kind: "permission"; permission: GlobalPermissionRequest }
  | { kind: "accessRole"; role: AccessRole }

export type AuthorizationDeniedContext = {
  actor: AuthorizationActorContext
  requirement: AuthorizationRequirement
}

export const AUTHORIZATION_DENIED = "AUTHORIZATION_DENIED"

/** Thrown when an actor may not do the thing. Carries who asked and what they lacked. */
export class AuthorizationDeniedError extends Error {
  readonly code: typeof AUTHORIZATION_DENIED = AUTHORIZATION_DENIED

  constructor(readonly context: AuthorizationDeniedContext) {
    super("The current actor is not authorized to perform this operation.")
    this.name = "AuthorizationDeniedError"
  }
}

function denyAuthorization(context: AuthorizationDeniedContext): never {
  throw new AuthorizationDeniedError(context)
}

function parseAccessRoles(value: unknown): AccessRole[] {
  const knownRoles = new Set<string>(Object.keys(accessRoles))
  const roles = parseRoles(value).filter((role): role is AccessRole => knownRoles.has(role))

  return typeof value === "string" || Array.isArray(value) ? roles : [DEFAULT_ROLE]
}

async function getCurrentActor(): Promise<RequestActor | null> {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return null
  }

  return {
    userId: session.user.id,
    roles: parseAccessRoles(session.user.role)
  }
}

function getActorFromSession(session: PermissionSession | null): RequestActor | null {
  if (!session) {
    return null
  }

  return {
    userId: session.user.id,
    roles: parseAccessRoles(session.user.role)
  }
}

/** Use the session the caller already has, or go and read one from the request. */
async function resolveActor(session?: PermissionSession | null): Promise<RequestActor | null> {
  return session === undefined ? await getCurrentActor() : getActorFromSession(session)
}

function actorContext(actor: RequestActor | null): AuthorizationActorContext {
  return actor ? { state: "authenticated", userId: actor.userId } : { state: "unauthenticated" }
}

/* PERMISSIONS */
async function actorHasPermission(actor: RequestActor | null, permission: GlobalPermissionRequest): Promise<boolean> {
  if (!actor) {
    return false
  }

  const result = await auth.api.userHasPermission({
    body: {
      userId: actor.userId,
      permissions: {
        [permission.resource]: [permission.action]
      }
    }
  })

  return result.success
}

/** Whether the actor holds `permission`. Answers false rather than throwing. */
export async function canCurrentUser<const Request extends GlobalPermissionRequest>(
  permission: ExactGlobalPermissionRequest<Request>,
  session?: PermissionSession | null
): Promise<boolean> {
  return actorHasPermission(await resolveActor(session), permission)
}

/**
 * Assert `permission` and return the actor holding it, so the caller can attribute the
 * write it is about to make. Throws `AuthorizationDeniedError` otherwise.
 */
export async function requireCurrentUserPermission<const Request extends GlobalPermissionRequest>(
  permission: ExactGlobalPermissionRequest<Request>,
  session?: PermissionSession | null
): Promise<AuthenticatedAuthorizationActorContext> {
  const actor = await resolveActor(session)

  if (!actor || !(await actorHasPermission(actor, permission))) {
    denyAuthorization({
      actor: actorContext(actor),
      requirement: { kind: "permission", permission }
    })
  }

  return { state: "authenticated", userId: actor.userId }
}

/* ADMIN */
function actorIsAdmin(actor: RequestActor | null): boolean {
  return hasAdminRole(actor?.roles)
}

export async function isUserAdmin(session?: PermissionSession | null): Promise<boolean> {
  return actorIsAdmin(await resolveActor(session))
}

export async function requireAdmin(
  session?: PermissionSession | null
): Promise<AuthenticatedAuthorizationActorContext> {
  const actor = await resolveActor(session)

  if (!actor || !actorIsAdmin(actor)) {
    denyAuthorization({
      actor: actorContext(actor),
      requirement: { kind: "accessRole", role: ADMIN_ROLE }
    })
  }

  return { state: "authenticated", userId: actor.userId }
}
