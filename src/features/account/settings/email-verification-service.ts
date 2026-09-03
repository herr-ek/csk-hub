import { authClient } from "@/core/auth/auth-client"

export type EmailVerificationResult = { success: true } | { success: false; error: string }

export async function sendEmailVerificationOtp(email: string): Promise<EmailVerificationResult> {
  const result = await authClient.emailOtp.sendVerificationOtp({
    email,
    type: "email-verification"
  })

  return result.error
    ? { success: false, error: result.error.message ?? "Unable to send a verification code." }
    : { success: true }
}

export async function verifyEmailOtp(email: string, otp: string): Promise<EmailVerificationResult> {
  const result = await authClient.emailOtp.verifyEmail({ email, otp })

  return result.error
    ? { success: false, error: result.error.message ?? "Unable to verify this code." }
    : { success: true }
}
