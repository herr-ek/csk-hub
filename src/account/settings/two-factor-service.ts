import { authClient } from "@/core/auth/auth-client"

export type TwoFactorSettingsOperationResult = { success: true } | { success: false; error: string }

export type EnableTwoFactorResult =
  | { success: true; totpUri?: string; backupCodes?: string[] }
  | { success: false; error: string }

export async function enableTwoFactor(password: string): Promise<EnableTwoFactorResult> {
  const result = await authClient.twoFactor.enable({ password })
  if (result.error)
    return { success: false, error: result.error.message ?? "Unable to enable two-factor authentication." }

  return {
    success: true,
    totpUri: result.data?.totpURI,
    backupCodes: result.data?.backupCodes
  }
}

export async function disableTwoFactor(password: string): Promise<TwoFactorSettingsOperationResult> {
  const result = await authClient.twoFactor.disable({ password })
  return result.error
    ? { success: false, error: result.error.message ?? "Unable to disable two-factor authentication." }
    : { success: true }
}

export async function verifyTwoFactorSetup(code: string): Promise<TwoFactorSettingsOperationResult> {
  const result = await authClient.twoFactor.verifyTotp({ code })
  return result.error
    ? { success: false, error: result.error.message ?? "Unable to verify the authenticator code." }
    : { success: true }
}
