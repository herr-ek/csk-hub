import { authClient } from "@/core/auth/auth-client"

export type TwoFactorMethod = "otp" | "totp" | "backup"
export type TwoFactorOperationResult = { success: true; role?: string } | { success: false; error: string }

export function getAvailableMethods(methods: string[]): Exclude<TwoFactorMethod, "backup">[] {
  return methods.filter((method): method is "otp" | "totp" => method === "otp" || method === "totp")
}

export async function sendTwoFactorOtp(): Promise<TwoFactorOperationResult> {
  const result = await authClient.twoFactor.sendOtp()
  return result.error
    ? { success: false, error: result.error.message ?? "Unable to send the verification code." }
    : { success: true }
}

export async function verifyTwoFactorMethod(
  method: TwoFactorMethod,
  code: string,
  trustDevice: boolean
): Promise<TwoFactorOperationResult> {
  const result =
    method === "totp"
      ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
      : method === "otp"
        ? await authClient.twoFactor.verifyOtp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice, disableSession: false })

  if (result.error) return { success: false, error: result.error.message ?? "Unable to verify the code." }

  const role = result.data?.user?.role
  return role ? { success: true, role } : { success: true }
}
