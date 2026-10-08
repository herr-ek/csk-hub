import { authClient } from "@/core/auth/auth-client"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { type LoginResult, signInWithEmailPassword } from "../login/service"

export type PasswordResetFailureKind =
  | "request-failed"
  | "request-network"
  | "invalid-reset-token"
  | "network"
  | "unknown"
  | "password-updated-sign-in-failed"
export type PasswordResetRequestResult =
  | { success: true }
  | { success: false; kind: PasswordResetFailureKind; error: string }
export type PasswordResetResult =
  | { success: true; signIn: Extract<LoginResult, { success: true }> }
  | { success: false; kind: PasswordResetFailureKind; error: string }

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  try {
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: `${ROUTES.resetPassword}?email=${encodeURIComponent(email)}`
    })

    if (result.error) {
      logger.warn("auth.password-reset.request-failed", {
        errorCode: getErrorCode(result.error),
        status: getErrorStatus(result.error)
      })
      const kind = getErrorStatus(result.error) >= 500 ? "request-network" : "request-failed"
      return { success: false, kind, error: kind }
    }
    return { success: true }
  } catch (error) {
    logger.error("auth.password-reset.request-failed", { kind: "network", errorName: getErrorName(error) })
    return { success: false, kind: "request-network", error: "request-network" }
  }
}

export async function resetPassword(token: string, email: string, newPassword: string): Promise<PasswordResetResult> {
  try {
    const result = await authClient.resetPassword({ newPassword, token })
    if (result.error) {
      const kind = getFailureKind(result.error)
      logger.warn("auth.password-reset.failed", { kind, errorCode: getErrorCode(result.error) })
      return { success: false, kind, error: kind }
    }
    const signIn = await signInWithEmailPassword({ email, password: newPassword, rememberMe: true })
    if (signIn.success) return { success: true, signIn }

    return {
      success: false,
      kind: "password-updated-sign-in-failed",
      error: "password-updated-sign-in-failed"
    }
  } catch (error) {
    logger.error("auth.password-reset.failed", { kind: "network", errorName: getErrorName(error) })
    return { success: false, kind: "network", error: "network" }
  }
}

function getFailureKind(error: unknown): PasswordResetFailureKind {
  const status = getErrorStatus(error)
  if (status >= 500) return "network"

  const code = getErrorCode(error)
  return ["INVALID_TOKEN", "TOKEN_EXPIRED", "INVALID_RESET_TOKEN"].includes(code) ? "invalid-reset-token" : "unknown"
}
