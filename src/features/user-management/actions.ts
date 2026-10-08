"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ROUTES } from "@/core/navigation/site"
import { accessRoleNames } from "@/shared/roles"
import type { ImpersonateUserResult, UserCommandState } from "./command-state"
import {
  activateUserCommand,
  changeUserRoleCommand,
  deactivateUserCommand,
  eraseUserCommand,
  impersonateUserCommand,
  resendInvitationCommand
} from "./commands"

export type { UserCommandState } from "./command-state"

const userIdSchema = z.object({ userId: z.string().trim().min(1) })
const eraseUserSchema = userIdSchema.extend({ confirmation: z.string().optional() })
const changeRolesSchema = userIdSchema.extend({ roles: z.array(z.enum(accessRoleNames)).min(1) })

function invalidInput(): UserCommandState {
  return { status: "error", error: "That user action could not be completed." }
}

function refreshUsers(state: UserCommandState): UserCommandState {
  if (state.status === "success") revalidatePath(ROUTES.adminUsers)
  return state
}

export async function activateUser(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = userIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  return refreshUsers(await activateUserCommand(input.data.userId))
}

export async function deactivateUser(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = userIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  return refreshUsers(await deactivateUserCommand(input.data.userId))
}

export async function eraseUser(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = eraseUserSchema.safeParse({
    userId: formData.get("userId"),
    confirmation: formData.get("confirmation") ?? undefined
  })
  if (!input.success) return invalidInput()
  return refreshUsers(await eraseUserCommand(input.data.userId, input.data.confirmation))
}

export async function resendInvitation(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = userIdSchema.safeParse({ userId: formData.get("userId") })
  if (!input.success) return invalidInput()
  return refreshUsers(await resendInvitationCommand(input.data.userId))
}

export async function changeUserRole(_state: UserCommandState, formData: FormData): Promise<UserCommandState> {
  const input = changeRolesSchema.safeParse({ userId: formData.get("userId"), roles: formData.getAll("roles") })
  if (!input.success) return invalidInput()
  return refreshUsers(await changeUserRoleCommand(input.data.userId, input.data.roles))
}

export async function impersonateUser(userId: string): Promise<ImpersonateUserResult> {
  const input = userIdSchema.safeParse({ userId })
  if (!input.success) return { status: "error", error: "That user could not be impersonated." }
  return impersonateUserCommand(input.data.userId)
}
