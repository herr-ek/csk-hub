import "server-only"

import { eq } from "drizzle-orm"
import type { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { hasAdminRole } from "@/shared/roles"
import type { AuthorizationActor, AuthorizationSession, PermissionRequest } from "./model"
import { evaluatePermission } from "./policies"

export type AuthorizationDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export const AUTHORIZATION_DENIED = "AUTHORIZATION_DENIED"

/** Server diagnostics only. Transports must not disclose resource existence or actor details. */
export class AuthorizationDeniedError extends Error {
  readonly code = AUTHORIZATION_DENIED

  constructor(
    readonly request: PermissionRequest,
    readonly actor: AuthorizationActor | null
  ) {
    super("The current actor is not authorized to perform this operation.")
    this.name = "AuthorizationDeniedError"
  }
}

type Dependencies = {
  database: AuthorizationDatabase
  readSession: () => Promise<AuthorizationSession | null>
}

export type RequestAuthorization = Readonly<{
  /** Identity snapshot for loading actor-specific facts, never a durable permission grant. */
  actor: AuthorizationActor | null
  /** Evaluates trusted resource facts using this operation's actor snapshot; no I/O or locks. */
  can: (request: PermissionRequest) => boolean
  /** Returns the actor for attribution or throws AuthorizationDeniedError using the same policy. */
  requirePermission: (request: PermissionRequest) => AuthorizationActor
}>

/**
 * Composes trusted session/actor resolution with the pure policies. The resolver must validate
 * the actual request session, bypassing cookie caches. Session role/status claims are ignored.
 * Resource and relationship attributes come from the calling feature's trusted server reads.
 */
export function createAuthorization({ database, readSession }: Dependencies) {
  async function getActor(connection: AuthorizationDatabase): Promise<AuthorizationActor | null> {
    const session = await readSession()
    if (!session) return null
    const [row] = await connection
      .select({ id: user.id, role: user.role, banned: user.banned })
      .from(user)
      .where(eq(user.id, session.user.id))
    if (!row || row.banned === true) return null
    return Object.freeze({
      userId: row.id,
      isAdmin: hasAdminRole(row.role),
      impersonatedBy: session.session.impersonatedBy ?? null
    })
  }

  /**
   * Resolves one fresh actor snapshot for one server operation. Load facts in the same operation,
   * then call can/requirePermission; never cache or reuse this object across requests or writes.
   * A supplied transaction shares visibility but acquires no authorization/revocation locks.
   * The feature must coordinate resource/fact reads and writes with their concurrent writers.
   */
  async function forCurrentRequest(connection = database): Promise<RequestAuthorization> {
    const actor = await getActor(connection)

    function can(request: PermissionRequest): boolean {
      return evaluatePermission(actor, request)
    }

    function requirePermission(request: PermissionRequest): AuthorizationActor {
      if (!actor || !can(request)) throw new AuthorizationDeniedError(request, actor)
      return actor
    }

    return Object.freeze({ actor, can, requirePermission })
  }

  /** Resolves a fresh actor for this check. Expected denials are false; session/DB failures propagate. */
  async function can(request: PermissionRequest, connection = database): Promise<boolean> {
    return (await forCurrentRequest(connection)).can(request)
  }

  /**
   * Resolves a fresh actor and applies the same policy as can. Returns attribution or throws
   * AuthorizationDeniedError. Supplied attributes must describe the resource actually operated on;
   * this check neither loads resources nor locks them, and is not authority for a later write.
   */
  async function requirePermission(request: PermissionRequest, connection = database): Promise<AuthorizationActor> {
    return (await forCurrentRequest(connection)).requirePermission(request)
  }

  return { can, requirePermission, forCurrentRequest }
}
