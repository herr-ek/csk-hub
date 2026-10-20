import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import type { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { post } from "@/core/db/schema/posts"
import { hasAdminRole } from "@/shared/roles"
import type { AuthorizationActor, AuthorizationSession, PermissionRequest } from "./model"

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

const uuid = z.uuid()

/**
 * Server composition seam for request authentication and a database (also used by isolated tests).
 * readSession must validate the actual session, bypassing cookie caches. Session role/status
 * claims are ignored; each operation reloads the effective User. No facts or decisions are cached.
 * Passing a transaction shares reads with a write but does not itself lock against revocation.
 * Feature adoption must coordinate the locks described in docs/authorization.md.
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
    return {
      userId: row.id,
      isAdmin: hasAdminRole(row.role),
      impersonatedBy: session.session.impersonatedBy ?? null
    }
  }

  async function membership(connection: AuthorizationDatabase, userId: string, groupId: string) {
    if (!uuid.safeParse(groupId).success) return false
    const [row] = await connection
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(and(eq(groupMember.userId, userId), eq(groupMember.groupId, groupId), isNull(groupMember.endDate)))
      .limit(1)
    return Boolean(row)
  }

  async function holding(connection: AuthorizationDatabase, userId: string, groupId: string, positionId?: string) {
    if (!uuid.safeParse(groupId).success || (positionId !== undefined && !uuid.safeParse(positionId).success)) {
      return false
    }
    const [row] = await connection
      .select({ userId: positionHolder.userId })
      .from(positionHolder)
      .where(
        and(
          eq(positionHolder.userId, userId),
          eq(positionHolder.groupId, groupId),
          isNull(positionHolder.endDate),
          positionId === undefined ? undefined : eq(positionHolder.positionId, positionId)
        )
      )
      .limit(1)
    return Boolean(row)
  }

  async function allows(
    actor: AuthorizationActor,
    request: PermissionRequest,
    connection: AuthorizationDatabase
  ): Promise<boolean> {
    switch (request.action) {
      case "admin.access":
      case "org.manage":
      case "user.administer":
      case "notification.broadcast":
        return actor.isAdmin
      case "post.create":
        return true
      case "post.read":
      case "post.update":
      case "post.publish":
      case "post.unpublish":
      case "post.discard": {
        if (!uuid.safeParse(request.postId).success) return false
        const [row] = await connection
          .select({ authorId: post.authorId, publishedAt: post.publishedAt, discardedAt: post.discardedAt })
          .from(post)
          .where(eq(post.id, request.postId))
        if (!row || row.discardedAt) return false
        const own = row.authorId === actor.userId
        if (row.publishedAt === null) {
          // Admin cannot read, edit, publish or discard somebody else's private Draft.
          return own && request.action !== "post.unpublish"
        }
        if (request.action === "post.read") return true
        if (request.action === "post.update" || request.action === "post.unpublish") return own || actor.isAdmin
        return false
      }
      case "group.publishPost":
      case "group.manageContent":
      case "group.manageEvents":
      case "group.manageMemberships":
      case "group.managePositions": {
        if (!uuid.safeParse(request.groupId).success) return false
        const [row] = await connection
          .select({ active: group.active, type: group.type })
          .from(group)
          .where(eq(group.id, request.groupId))
        if (!row?.active) return false
        if (actor.isAdmin) return true
        if (
          row.type === "Choir" ||
          request.action === "group.manageMemberships" ||
          request.action === "group.managePositions"
        ) {
          return false
        }
        return (
          (await membership(connection, actor.userId, request.groupId)) &&
          (await holding(connection, actor.userId, request.groupId))
        )
      }
      case "member.read":
      case "member.readEmail":
      case "member.editProfile": {
        const [row] = await connection.select({ banned: user.banned }).from(user).where(eq(user.id, request.memberId))
        if (!row || row.banned === true) return false
        if (request.action === "member.read") return true
        if (request.memberId !== actor.userId) return false
        return request.action === "member.readEmail" || actor.impersonatedBy === null
      }
      default:
        return false
    }
  }

  /** False for expected denials; authentication/DB failures propagate. Never use as a cached grant. */
  async function can(request: PermissionRequest, connection = database): Promise<boolean> {
    const actor = await getActor(connection)
    return actor !== null && allows(actor, request, connection)
  }

  /**
   * Checks the specific resource and returns the effective actor for attribution, or throws
   * AuthorizationDeniedError. The caller must preserve lifecycle predicates and coordinate this
   * check with persistence and concurrent permission changes; a preceding can() is insufficient.
   */
  async function requirePermission(request: PermissionRequest, connection = database): Promise<AuthorizationActor> {
    const actor = await getActor(connection)
    if (!actor || !(await allows(actor, request, connection))) throw new AuthorizationDeniedError(request, actor)
    return actor
  }

  /**
   * A fact about the effective User, matching org-structure: an open-ended Membership, including
   * in archived Groups. It is not permission to act. An unauthenticated/inactive User returns false.
   */
  async function isCurrentMemberOfGroup(groupId: string, connection = database): Promise<boolean> {
    const actor = await getActor(connection)
    return actor !== null && membership(connection, actor.userId, groupId)
  }

  /**
   * An open-ended holding in the exact Group, optionally of a specific Position UUID. Archived
   * holdings are included, as in org-structure. No title matching, inheritance, or permission grant.
   */
  async function holdsCurrentPosition(
    input: { groupId: string; positionId?: string },
    connection = database
  ): Promise<boolean> {
    const actor = await getActor(connection)
    return actor !== null && holding(connection, actor.userId, input.groupId, input.positionId)
  }

  return { can, requirePermission, isCurrentMemberOfGroup, holdsCurrentPosition }
}
