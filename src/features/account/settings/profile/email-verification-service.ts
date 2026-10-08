import { authClient } from "@/core/auth/auth-client"

export type EmailVerificationResult = { success: true } | { success: false; error: "send-failed" | "verify-failed" }

export async function sendEmailVerificationOtp(email: string): Promise<EmailVerificationResult> {
  const result = await authClient.emailOtp.sendVerificationOtp({
    email,
    type: "email-verification"
  })

  return result.error ? { success: false, error: "send-failed" } : { success: true }
}

export async function verifyEmailOtp(email: string, otp: string): Promise<EmailVerificationResult> {
  const result = await authClient.emailOtp.verifyEmail({ email, otp })

  return result.error ? { success: false, error: "verify-failed" } : { success: true }
}
