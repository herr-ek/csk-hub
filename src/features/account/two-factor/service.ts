import { authClient } from "@/core/auth/auth-client"
import { isOAuthRedirect } from "@/core/auth/oauth-continuation"

export type TwoFactorMethod = "otp" | "totp" | "backup"
type OperationFailure = { success: false; error: "sendFailed" | "verifyFailed" } | { success: false; unavailable: true }
export type TwoFactorOperationResult = { success: true; redirecting?: boolean; role?: string } | OperationFailure

export function getAvailableMethods(methods: string[]): Exclude<TwoFactorMethod, "backup">[] {
  return methods.filter((method): method is "otp" | "totp" => method === "otp" || method === "totp")
}

export async function sendTwoFactorOtp(): Promise<TwoFactorOperationResult> {
  try {
    const result = await authClient.twoFactor.sendOtp()
    return result.error ? { success: false, error: "sendFailed" } : { success: true }
  } catch {
    return { success: false, unavailable: true }
  }
}

export async function verifyTwoFactorMethod(
  method: TwoFactorMethod,
  code: string,
  trustDevice: boolean
): Promise<TwoFactorOperationResult> {
  try {
    const result =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : method === "otp"
          ? await authClient.twoFactor.verifyOtp({ code, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice, disableSession: false })

    if (result.error) return { success: false, error: "verifyFailed" }

    if (isOAuthRedirect(result.data)) return { success: true, redirecting: true }

    const role = result.data?.user?.role
    return role ? { success: true, role } : { success: true }
  } catch {
    return { success: false, unavailable: true }
  }
}
