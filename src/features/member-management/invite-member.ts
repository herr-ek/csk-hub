import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { requireAdmin } from "@/core/auth/permissions.server"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { MEMBER_ROLE } from "@/shared/roles"

export type InviteMemberInput = { name: string; email: string }
export type InviteMemberResult =
  | { kind: "sent" }
  | { kind: "email-failed" }
  | { kind: "already-exists" }
  | { kind: "creation-failed" }

const INVITE_CONCURRENCY = 5

export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  await requireAdmin()
  return inviteMemberAsAdmin(input)
}

export async function inviteMembers(inputs: InviteMemberInput[]): Promise<InviteMemberResult[]> {
  await requireAdmin()
  const results: InviteMemberResult[] = []

  for (let index = 0; index < inputs.length; index += INVITE_CONCURRENCY) {
    const batch = await Promise.all(inputs.slice(index, index + INVITE_CONCURRENCY).map(inviteMemberAsAdmin))
    results.push(...batch)
  }

  return results
}

async function inviteMemberAsAdmin(input: InviteMemberInput): Promise<InviteMemberResult> {
  try {
    await auth.api.createUser({
      headers: await headers(),
      body: { name: input.name, email: input.email, role: MEMBER_ROLE }
    })
  } catch (error) {
    if (getErrorCode(error) === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return { kind: "already-exists" }

    logger.error("admin.members.create-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { kind: "creation-failed" }
  }

  try {
    await auth.api.signInMagicLink({
      headers: await headers(),
      body: {
        email: input.email,
        name: input.name,
        callbackURL: ROUTES.activate,
        errorCallbackURL: ROUTES.activationFailed
      }
    })
    return { kind: "sent" }
  } catch (error) {
    logger.error("admin.members.invite-dispatch-failed", {
      email: input.email,
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { kind: "email-failed" }
  }
}
