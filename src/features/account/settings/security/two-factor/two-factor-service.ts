import { authClient } from "@/core/auth/auth-client"

type OperationFailure = { success: false; error: string } | { success: false; unavailable: true }
export type TwoFactorSettingsOperationResult = { success: true } | OperationFailure

export type EnableTwoFactorResult = { success: true; totpUri?: string; backupCodes?: string[] } | OperationFailure

export async function enableTwoFactor(password: string): Promise<EnableTwoFactorResult> {
  try {
    const result = await authClient.twoFactor.enable({ password })
    if (result.error)
      return { success: false, error: result.error.message ?? "Unable to enable two-factor authentication." }

    if (result.data?.method !== "totp") return { success: true }

    return {
      success: true,
      totpUri: result.data.totpURI,
      backupCodes: result.data.backupCodes
    }
  } catch {
    return { success: false, unavailable: true }
  }
}

export async function disableTwoFactor(password: string): Promise<TwoFactorSettingsOperationResult> {
  try {
    const result = await authClient.twoFactor.disable({ password })
    return result.error
      ? { success: false, error: result.error.message ?? "Unable to disable two-factor authentication." }
      : { success: true }
  } catch {
    return { success: false, unavailable: true }
  }
}

export async function verifyTwoFactorSetup(code: string): Promise<TwoFactorSettingsOperationResult> {
  try {
    const result = await authClient.twoFactor.verifyTotp({ code })
    return result.error
      ? { success: false, error: result.error.message ?? "Unable to verify the authenticator code." }
      : { success: true }
  } catch {
    return { success: false, unavailable: true }
  }
}
