import { authClient } from "@/core/auth/auth-client"

export type TwoFactorSettingsFailure = "enableFailed" | "disableFailed" | "verifyFailed"
type OperationFailure = { success: false; error: TwoFactorSettingsFailure } | { success: false; unavailable: true }
export type TwoFactorSettingsOperationResult = { success: true } | OperationFailure

export type EnableTwoFactorResult = { success: true; totpUri?: string; backupCodes?: string[] } | OperationFailure

export async function enableTwoFactor(password: string): Promise<EnableTwoFactorResult> {
  try {
    const result = await authClient.twoFactor.enable({ password })
    if (result.error) return { success: false, error: "enableFailed" }

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
    return result.error ? { success: false, error: "disableFailed" } : { success: true }
  } catch {
    return { success: false, unavailable: true }
  }
}

export async function verifyTwoFactorSetup(code: string): Promise<TwoFactorSettingsOperationResult> {
  try {
    const result = await authClient.twoFactor.verifyTotp({ code })
    return result.error ? { success: false, error: "verifyFailed" } : { success: true }
  } catch {
    return { success: false, unavailable: true }
  }
}
