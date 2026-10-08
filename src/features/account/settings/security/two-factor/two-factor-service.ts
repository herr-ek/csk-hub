import { authClient } from "@/core/auth/auth-client"

export type TwoFactorSettingsFailure = "enableFailed" | "disableFailed" | "verifyFailed"
export type TwoFactorSettingsOperationResult = { success: true } | { success: false; error: TwoFactorSettingsFailure }

export type EnableTwoFactorResult =
  | { success: true; totpUri?: string; backupCodes?: string[] }
  | { success: false; error: TwoFactorSettingsFailure }

export async function enableTwoFactor(password: string): Promise<EnableTwoFactorResult> {
  const result = await authClient.twoFactor.enable({ password })
  if (result.error) return { success: false, error: "enableFailed" }

  if (result.data?.method !== "totp") return { success: true }

  return {
    success: true,
    totpUri: result.data.totpURI,
    backupCodes: result.data.backupCodes
  }
}

export async function disableTwoFactor(password: string): Promise<TwoFactorSettingsOperationResult> {
  const result = await authClient.twoFactor.disable({ password })
  return result.error ? { success: false, error: "disableFailed" } : { success: true }
}

export async function verifyTwoFactorSetup(code: string): Promise<TwoFactorSettingsOperationResult> {
  const result = await authClient.twoFactor.verifyTotp({ code })
  return result.error ? { success: false, error: "verifyFailed" } : { success: true }
}
