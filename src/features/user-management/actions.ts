"use server"

import { and, eq, exists, isNotNull, isNull, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@/core/auth/auth"
import { requireAdmin } from "@/core/auth/permissions.server"
import { db } from "@/core/db"
import { account, user } from "@/core/db/schema/auth"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { type AccessRole, ADMIN_ROLE, accessRoleNames, hasAdminRole, USER_ROLE } from "@/shared/roles"

const userIdSchema = z.object({ userId: z.string().trim().min(1) })
const eraseUserSchema = userIdSchema.extend({ confirmation: z.string().optional() })
const changeRolesSchema = userIdSchema.extend({ roles: z.array(z.enum(accessRoleNames)).min(1) })
export type UserCommandState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; action: "activate" | "deactivate" | "delete" | "invite" | "role" }

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

function invalidInput(): UserCommandState {
  return { status: "error", error: "That user action could not be completed." }
}

async function fail(action: string, error: unknown): Promise<UserCommandState> {
  logger.error(`admin.users.${action}-failed`, {
    errorCode: getErrorCode(error),
    errorName: getErrorName(error),
    status: getErrorStatus(error)
  })
  return { status: "error", error: "Unable to complete that user action right now. Please try again." }
}

export async function activateUser(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = userIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  await requireAdmin()
  const user = await getUser(input.data.userId)
  if (!user) return { status: "error", error: "That user could not be found." }
  if (!user.banned) return { status: "error", error: "That user is already active." }
  try {
    await auth.api.unbanUser({ headers: await headers(), body: { userId: user.id } })
    revalidatePath(ROUTES.adminUsers)
    return { status: "success", action: "activate" }
  } catch (error) {
    return fail("activate", error)
  }
}

export async function deactivateUser(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = userIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  const actor = await requireAdmin()
  const user = await getUser(input.data.userId)
  if (!user) return { status: "error", error: "That user could not be found." }
  if (user.id === actor.userId) return { status: "error", error: "You cannot deactivate your own account." }
  if (user.banned) return { status: "error", error: "That user is already inactive." }
  if (await isLastAdmin(user, true))
    return { status: "error", error: "You cannot deactivate the final remaining admin." }
  try {
    await auth.api.banUser({
      headers: await headers(),
      body: { userId: user.id, banReason: "Deactivated by an admin" }
    })
    revalidatePath(ROUTES.adminUsers)
    return { status: "success", action: "deactivate" }
  } catch (error) {
    return fail("deactivate", error)
  }
}

export async function eraseUser(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = eraseUserSchema.safeParse({
    userId: formData.get("userId"),
    confirmation: formData.get("confirmation") ?? undefined
  })
  if (!input.success) return invalidInput()
  const actor = await requireAdmin()
  const user = await getUser(input.data.userId)
  if (!user) return { status: "error", error: "That user could not be found." }
  if (user.id === actor.userId) return { status: "error", error: "You cannot erase your own account." }
  if (!user.banned) return { status: "error", error: "Deactivate the user before deleting them." }
  if (await isLastAdmin(user)) return { status: "error", error: "You cannot erase the final remaining admin." }
  if (input.data.confirmation !== `delete ${user.name}`)
    return { status: "error", error: "Type the deletion confirmation exactly to erase this user." }
  try {
    await auth.api.removeUser({ headers: await headers(), body: { userId: user.id } })
    revalidatePath(ROUTES.adminUsers)
    return { status: "success", action: "delete" }
  } catch (error) {
    return fail("erase", error)
  }
}

export async function resendInvitation(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = userIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  await requireAdmin()
  const user = await getUser(input.data.userId)
  if (!user) return { status: "error", error: "That user could not be found." }
  if (user.hasPassword) return { status: "error", error: "That user has already completed account activation." }
  try {
    await auth.api.signInMagicLink({
      headers: await headers(),
      body: {
        email: user.email,
        name: user.name,
        callbackURL: ROUTES.activate,
        errorCallbackURL: ROUTES.activationFailed
      }
    })
    revalidatePath(ROUTES.adminUsers)
    return { status: "success", action: "invite" }
  } catch (error) {
    return fail("resend-invitation", error)
  }
}

export async function changeUserRole(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = changeRolesSchema.safeParse({ userId: formData.get("userId"), roles: formData.getAll("roles") })
  if (!input.success) return invalidInput()
  const actor = await requireAdmin()
  const user = await getUser(input.data.userId)
  if (!user) return { status: "error", error: "That user could not be found." }
  if (user.id === actor.userId) return { status: "error", error: "You cannot change your own role." }

  const roles: AccessRole[] = input.data.roles.includes(ADMIN_ROLE) ? [USER_ROLE, ADMIN_ROLE] : [USER_ROLE]
  if (!roles.includes(ADMIN_ROLE) && (await isLastAdmin(user, true)))
    return { status: "error", error: "You cannot demote the final remaining admin." }

  try {
    await auth.api.setRole({ headers: await headers(), body: { userId: user.id, role: roles } })
    revalidatePath(ROUTES.adminUsers)
    return { status: "success", action: "role" }
  } catch (error) {
    return fail("change-role", error)
  }
}

export async function impersonateUser(
  userId: string
): Promise<{ status: "success" } | { status: "error"; error: string }> {
  const input = userIdSchema.safeParse({ userId })
  if (!input.success) return { status: "error", error: "That user could not be impersonated." }
  const actor = await requireAdmin()
  const user = await getUser(input.data.userId)
  if (!user || user.banned) return { status: "error", error: "Only active users can be impersonated." }
  if (hasAdminRole(user.role)) return { status: "error", error: "Admins cannot be impersonated." }
  try {
    const result = await auth.api.impersonateUser({ headers: await headers(), body: { userId: user.id } })
    logger.audit("auth.impersonation.started", {
      impersonationSessionId: result.session.id,
      adminUserId: actor.userId,
      impersonatedUserId: user.id,
      expiresAt: result.session.expiresAt.toISOString()
    })
    return { status: "success" }
  } catch (error) {
    logger.error("auth.impersonation.failed", {
      adminUserId: actor.userId,
      impersonatedUserId: user.id,
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "error", error: "Unable to switch to this user." }
  }
}
