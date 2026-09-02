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

export type GlobalPermissionRequest = {
  [Resource in PermissionResource]: {
    resource: Resource
    action: PermissionAction<Resource>
  }
}[PermissionResource]

export type ExactGlobalPermissionRequest<Request extends GlobalPermissionRequest> = Request &
  Record<Exclude<keyof Request, keyof GlobalPermissionRequest>, never>

export type AuthorizationActorContext = { state: "authenticated"; userId: string } | { state: "unauthenticated" }
export type AuthenticatedAuthorizationActorContext = Extract<AuthorizationActorContext, { state: "authenticated" }>

export type AuthorizationRequirement =
  | { kind: "permission"; permission: GlobalPermissionRequest }
  | { kind: "accessRole"; role: AccessRole }

export type AuthorizationDeniedContext = {
  actor: AuthorizationActorContext
  requirement: AuthorizationRequirement
}

export class AuthorizationDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED"

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

function getActorFromSession(session?: { user: { id: string; role?: string | null } } | null): RequestActor | null {
  if (!session) {
    return null
  }

  return {
    userId: session.user.id,
    roles: parseAccessRoles(session.user.role)
  }
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

export async function canCurrentUser<const Request extends GlobalPermissionRequest>(
  permission: ExactGlobalPermissionRequest<Request>
): Promise<boolean> {
  return actorHasPermission(await getCurrentActor(), permission)
}

export async function requireCurrentUserPermission<const Request extends GlobalPermissionRequest>(
  permission: ExactGlobalPermissionRequest<Request>
): Promise<AuthenticatedAuthorizationActorContext> {
  const actor = await getCurrentActor()

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

export async function isUserAdmin(session?: { user: { id: string; role?: string | null } } | null): Promise<boolean> {
  const actor = session === undefined ? await getCurrentActor() : getActorFromSession(session)
  return actorIsAdmin(actor)
}

export async function requireAdmin(
  session?: { user: { id: string; role?: string | null } } | null
): Promise<AuthenticatedAuthorizationActorContext> {
  const actor = session === undefined ? await getCurrentActor() : getActorFromSession(session)

  if (!actor || !actorIsAdmin(actor)) {
    denyAuthorization({
      actor: actorContext(actor),
      requirement: { kind: "accessRole", role: ADMIN_ROLE }
    })
  }

  return { state: "authenticated", userId: actor.userId }
}
