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
import { type AccessRole, ADMIN_ROLE, accessRoleNames, hasAdminRole, MEMBER_ROLE } from "@/shared/roles"

const memberIdSchema = z.object({ userId: z.string().trim().min(1) })
const eraseMemberSchema = memberIdSchema.extend({ confirmation: z.string().optional() })
const changeRolesSchema = memberIdSchema.extend({ roles: z.array(z.enum(accessRoleNames)).min(1) })
export type MemberCommandState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; action: "activate" | "deactivate" | "delete" | "invite" | "role" }

async function getMember(userId: string) {
  const [member] = await db
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
  return member
}

async function isLastAdmin(member: { role: string | null }, activeOnly = false): Promise<boolean> {
  if (!hasAdminRole(member.role)) return false

  const activeMembers = activeOnly
    ? await db
        .select({ role: user.role })
        .from(user)
        .where(or(eq(user.banned, false), isNull(user.banned)))
    : await db.select({ role: user.role }).from(user)

  return activeMembers.filter((candidate) => hasAdminRole(candidate.role)).length <= 1
}

function invalidInput(): MemberCommandState {
  return { status: "error", error: "That member action could not be completed." }
}

async function fail(action: string, error: unknown): Promise<MemberCommandState> {
  logger.error(`admin.members.${action}-failed`, {
    errorCode: getErrorCode(error),
    errorName: getErrorName(error),
    status: getErrorStatus(error)
  })
  return { status: "error", error: "Unable to complete that member action right now. Please try again." }
}

export async function activateMember(_state: MemberCommandState, formData: FormData): Promise<MemberCommandState> {
  const input = memberIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  await requireAdmin()
  const member = await getMember(input.data.userId)
  if (!member) return { status: "error", error: "That member could not be found." }
  if (!member.banned) return { status: "error", error: "That member is already active." }
  try {
    await auth.api.unbanUser({ headers: await headers(), body: { userId: member.id } })
    revalidatePath(ROUTES.adminMembers)
    return { status: "success", action: "activate" }
  } catch (error) {
    return fail("activate", error)
  }
}

export async function deactivateMember(_state: MemberCommandState, formData: FormData): Promise<MemberCommandState> {
  const input = memberIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  const actor = await requireAdmin()
  const member = await getMember(input.data.userId)
  if (!member) return { status: "error", error: "That member could not be found." }
  if (member.id === actor.userId) return { status: "error", error: "You cannot deactivate your own account." }
  if (member.banned) return { status: "error", error: "That member is already inactive." }
  if (await isLastAdmin(member, true))
    return { status: "error", error: "You cannot deactivate the final remaining admin." }
  try {
    await auth.api.banUser({
      headers: await headers(),
      body: { userId: member.id, banReason: "Deactivated by an admin" }
    })
    revalidatePath(ROUTES.adminMembers)
    return { status: "success", action: "deactivate" }
  } catch (error) {
    return fail("deactivate", error)
  }
}

export async function eraseMember(_state: MemberCommandState, formData: FormData): Promise<MemberCommandState> {
  const input = eraseMemberSchema.safeParse({
    userId: formData.get("userId"),
    confirmation: formData.get("confirmation") ?? undefined
  })
  if (!input.success) return invalidInput()
  const actor = await requireAdmin()
  const member = await getMember(input.data.userId)
  if (!member) return { status: "error", error: "That member could not be found." }
  if (member.id === actor.userId) return { status: "error", error: "You cannot erase your own account." }
  if (!member.banned) return { status: "error", error: "Deactivate the member before deleting them." }
  if (await isLastAdmin(member)) return { status: "error", error: "You cannot erase the final remaining admin." }
  if (input.data.confirmation !== `delete ${member.name}`)
    return { status: "error", error: "Type the deletion confirmation exactly to erase this member." }
  try {
    await auth.api.removeUser({ headers: await headers(), body: { userId: member.id } })
    revalidatePath(ROUTES.adminMembers)
    return { status: "success", action: "delete" }
  } catch (error) {
    return fail("erase", error)
  }
}

export async function resendInvitation(_state: MemberCommandState, formData: FormData): Promise<MemberCommandState> {
  const input = memberIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  await requireAdmin()
  const member = await getMember(input.data.userId)
  if (!member) return { status: "error", error: "That member could not be found." }
  if (member.hasPassword) return { status: "error", error: "That member has already completed account activation." }
  try {
    await auth.api.signInMagicLink({
      headers: await headers(),
      body: {
        email: member.email,
        name: member.name,
        callbackURL: ROUTES.activate,
        errorCallbackURL: ROUTES.activationFailed
      }
    })
    revalidatePath(ROUTES.adminMembers)
    return { status: "success", action: "invite" }
  } catch (error) {
    return fail("resend-invitation", error)
  }
}

export async function changeMemberRole(_state: MemberCommandState, formData: FormData): Promise<MemberCommandState> {
  const input = changeRolesSchema.safeParse({ userId: formData.get("userId"), roles: formData.getAll("roles") })
  if (!input.success) return invalidInput()
  const actor = await requireAdmin()
  const member = await getMember(input.data.userId)
  if (!member) return { status: "error", error: "That member could not be found." }
  if (member.id === actor.userId) return { status: "error", error: "You cannot change your own role." }

  const roles: AccessRole[] = input.data.roles.includes(ADMIN_ROLE) ? [MEMBER_ROLE, ADMIN_ROLE] : [MEMBER_ROLE]
  if (!roles.includes(ADMIN_ROLE) && (await isLastAdmin(member, true)))
    return { status: "error", error: "You cannot demote the final remaining admin." }

  try {
    await auth.api.setRole({ headers: await headers(), body: { userId: member.id, role: roles } })
    revalidatePath(ROUTES.adminMembers)
    return { status: "success", action: "role" }
  } catch (error) {
    return fail("change-role", error)
  }
}

export async function impersonateMember(
  userId: string
): Promise<{ status: "success" } | { status: "error"; error: string }> {
  const input = memberIdSchema.safeParse({ userId })
  if (!input.success) return { status: "error", error: "That member could not be impersonated." }
  const actor = await requireAdmin()
  const member = await getMember(input.data.userId)
  if (!member || member.banned) return { status: "error", error: "Only active members can be impersonated." }
  if (hasAdminRole(member.role)) return { status: "error", error: "Admins cannot be impersonated." }
  try {
    const result = await auth.api.impersonateUser({ headers: await headers(), body: { userId: member.id } })
    logger.audit("auth.impersonation.started", {
      impersonationSessionId: result.session.id,
      adminUserId: actor.userId,
      memberUserId: member.id,
      expiresAt: result.session.expiresAt.toISOString()
    })
    return { status: "success" }
  } catch (error) {
    logger.error("auth.impersonation.failed", {
      adminUserId: actor.userId,
      memberUserId: member.id,
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "error", error: "Unable to switch to this member." }
  }
}
