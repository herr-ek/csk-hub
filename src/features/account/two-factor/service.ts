import { authClient } from "@/core/auth/auth-client"

export type TwoFactorMethod = "otp" | "totp" | "backup"
type OperationFailure = { success: false; error: "sendFailed" | "verifyFailed" } | { success: false; unavailable: true }
export type TwoFactorOperationResult = { success: true; role?: string; redirecting?: boolean } | OperationFailure

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

    const role = result.data?.user?.role
    const redirecting = result.data && "redirect" in result.data && result.data.redirect === true
    return { success: true, ...(role ? { role } : {}), ...(redirecting ? { redirecting: true } : {}) }
  } catch {
    return { success: false, unavailable: true }
  }
}
