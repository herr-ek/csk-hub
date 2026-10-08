"use server"

import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { validationMessageIds } from "@/shared/schemas"
import { activationSchema } from "./schemas"

export type ActivationState =
  | { status: "idle" }
  | {
      status: "error"
      kind:
        | "password-required"
        | "password-too-short"
        | "confirm-password-required"
        | "passwords-mismatch"
        | "invalid-link"
        | "unavailable"
    }
  | { status: "success"; redirectTo: string }

export async function activateAccount(_state: ActivationState, formData: FormData): Promise<ActivationState> {
  const input = activationSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  })

  if (!input.success) {
    if (input.error.issues.some((issue) => issue.message === validationMessageIds.passwordsMismatch))
      return { status: "error", kind: "passwords-mismatch" }
    const issue = input.error.issues[0]
    const field = issue?.path[0]
    if (field === "confirmPassword" && issue?.message === validationMessageIds.required)
      return { status: "error", kind: "confirm-password-required" }
    if (field === "password" && issue?.message === validationMessageIds.required)
      return { status: "error", kind: "password-required" }
    return { status: "error", kind: "password-too-short" }
  }

  try {
    await auth.api.setPassword({
      headers: await headers(),
      body: {
        newPassword: input.data.password
      }
    })

    // Better Auth's magic-link verification creates the session before redirecting here.
    return { status: "success", redirectTo: ROUTES.home }
  } catch (error) {
    const status = getErrorStatus(error)
    const code = getErrorCode(error)

    if (status === 401 || code === "INVALID_TOKEN" || code === "SESSION_EXPIRED") {
      return { status: "error", kind: "invalid-link" }
    }

    logger.error("auth.activation.failed", {
      errorCode: code,
      errorName: getErrorName(error),
      status
    })

    return { status: "error", kind: "unavailable" }
  }
}
