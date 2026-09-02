"use server"

import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { activationSchema } from "./schemas"

export type ActivationState =
  | { status: "idle" }
  | { status: "error"; error: string; kind: "validation" | "invalid-link" | "unknown" }
  | { status: "success"; redirectTo: string }

export async function activateAccount(_state: ActivationState, formData: FormData): Promise<ActivationState> {
  const input = activationSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  })

  if (!input.success) {
    if (input.error.issues.some((issue) => issue.path[0] === "confirmPassword" && issue.code === "custom"))
      return { status: "error", kind: "validation", error: "Passwords do not match." }

    return {
      status: "error",
      kind: "validation",
      error: "Use a password with at least 8 characters."
    }
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
      return { status: "error", kind: "invalid-link", error: "This activation link is invalid or has expired." }
    }

    logger.error("auth.activation.failed", {
      errorCode: code,
      errorName: getErrorName(error),
      status
    })

    return { status: "error", kind: "unknown", error: "Unable to activate your account right now. Please try again." }
  }
}
