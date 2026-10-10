import { and, eq, exists, isNotNull, isNull, or } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { requireAdmin } from "@/core/auth/permissions.server"
import { db } from "@/core/db"
import { account, user } from "@/core/db/schema/auth"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { type AccessRole, ADMIN_ROLE, hasAdminRole, USER_ROLE } from "@/shared/roles"
import type { ImpersonateUserResult, UserCommandState } from "./command-state"

async function getUser(userId: string) {
  const [targetUser] = await db
    .select({
      id: user.id,
      banned: user.banned,
      email: user.email,
      name: user.name,
      role: user.role,
      hasPassword: exists(
        db
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, user.id), eq(account.providerId, "credential"), isNotNull(account.password)))
      )
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return targetUser
}

async function isLastAdmin(targetUser: { role: string | null }, activeOnly = false): Promise<boolean> {
  if (!hasAdminRole(targetUser.role)) return false

  const activeUsers = activeOnly
    ? await db
        .select({ role: user.role })
        .from(user)
        .where(or(eq(user.banned, false), isNull(user.banned)))
    : await db.select({ role: user.role }).from(user)

  return activeUsers.filter((candidate) => hasAdminRole(candidate.role)).length <= 1
}

async function fail(action: string, error: unknown): Promise<UserCommandState> {
  logger.error(`admin.users.${action}-failed`, {
    errorCode: getErrorCode(error),
    errorName: getErrorName(error),
    status: getErrorStatus(error)
  })
  return { status: "error", error: "Unable to complete that user action right now. Please try again." }
}

export async function activateUserCommand(userId: string): Promise<UserCommandState> {
  await requireAdmin()
  const target = await getUser(userId)
  if (!target) return { status: "error", error: "That user could not be found." }
  if (!target.banned) return { status: "error", error: "That user is already active." }

  try {
    await auth.api.unbanUser({ headers: await headers(), body: { userId: target.id } })
    return { status: "success", action: "activate" }
  } catch (error) {
    return fail("activate", error)
  }
}

export async function deactivateUserCommand(userId: string): Promise<UserCommandState> {
  const actor = await requireAdmin()
  const target = await getUser(userId)
  if (!target) return { status: "error", error: "That user could not be found." }
  if (target.id === actor.userId) return { status: "error", error: "You cannot deactivate your own account." }
  if (target.banned) return { status: "error", error: "That user is already inactive." }
  if (await isLastAdmin(target, true))
    return { status: "error", error: "You cannot deactivate the final remaining admin." }

  try {
    await auth.api.banUser({
      headers: await headers(),
      body: { userId: target.id, banReason: "Deactivated by an admin" }
    })
    return { status: "success", action: "deactivate" }
  } catch (error) {
    return fail("deactivate", error)
  }
}

export async function eraseUserCommand(userId: string, confirmation: string | undefined): Promise<UserCommandState> {
  const actor = await requireAdmin()
  const target = await getUser(userId)
  if (!target) return { status: "error", error: "That user could not be found." }
  if (target.id === actor.userId) return { status: "error", error: "You cannot erase your own account." }
  if (!target.banned) return { status: "error", error: "Deactivate the user before deleting them." }
  if (await isLastAdmin(target)) return { status: "error", error: "You cannot erase the final remaining admin." }
  if (confirmation !== `delete ${target.name}`)
    return { status: "error", error: "Type the deletion confirmation exactly to erase this user." }

  try {
    await auth.api.removeUser({ headers: await headers(), body: { userId: target.id } })
    return { status: "success", action: "delete" }
  } catch (error) {
    return fail("erase", error)
  }
}

export async function resendInvitationCommand(userId: string): Promise<UserCommandState> {
  await requireAdmin()
  const target = await getUser(userId)
  if (!target) return { status: "error", error: "That user could not be found." }
  if (target.hasPassword) return { status: "error", error: "That user has already completed account activation." }

  try {
    await auth.api.signInMagicLink({
      headers: await headers(),
      body: {
        email: target.email,
        name: target.name,
        callbackURL: ROUTES.activate,
        errorCallbackURL: ROUTES.activationFailed
      }
    })
    return { status: "success", action: "invite" }
  } catch (error) {
    return fail("resend-invitation", error)
  }
}

export async function changeUserRoleCommand(userId: string, requestedRoles: AccessRole[]): Promise<UserCommandState> {
  const actor = await requireAdmin()
  const target = await getUser(userId)
  if (!target) return { status: "error", error: "That user could not be found." }
  if (target.id === actor.userId) return { status: "error", error: "You cannot change your own role." }

  const roles: AccessRole[] = requestedRoles.includes(ADMIN_ROLE) ? [USER_ROLE, ADMIN_ROLE] : [USER_ROLE]
  if (!roles.includes(ADMIN_ROLE) && (await isLastAdmin(target, true)))
    return { status: "error", error: "You cannot demote the final remaining admin." }

  try {
    await auth.api.setRole({ headers: await headers(), body: { userId: target.id, role: roles } })
    return { status: "success", action: "role" }
  } catch (error) {
    return fail("change-role", error)
  }
}

export async function impersonateUserCommand(userId: string): Promise<ImpersonateUserResult> {
  const actor = await requireAdmin()
  const target = await getUser(userId)
  if (!target || target.banned) return { status: "error", error: "Only active users can be impersonated." }
  if (hasAdminRole(target.role)) return { status: "error", error: "Admins cannot be impersonated." }

  try {
    const result = await auth.api.impersonateUser({ headers: await headers(), body: { userId: target.id } })
    logger.audit("auth.impersonation.started", {
      impersonationSessionId: result.session.id,
      adminUserId: actor.userId,
      impersonatedUserId: target.id,
      expiresAt: result.session.expiresAt.toISOString()
    })
    return { status: "success" }
  } catch (error) {
    logger.error("auth.impersonation.failed", {
      adminUserId: actor.userId,
      impersonatedUserId: target.id,
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "error", error: "Unable to switch to this user." }
  }
}
