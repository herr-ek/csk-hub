import type { EmailMessage } from "../types"

export function signInOtpTemplate(otp: string): Pick<EmailMessage, "subject" | "body"> {
  return { subject: "Your Sign-In OTP", body: `Your one-time password (OTP) for signing in is: ${otp}` }
}

export function twoFactorOtpTemplate(otp: string): Pick<EmailMessage, "subject" | "body"> {
  return { subject: "Your CSK Hub security code", body: `Your CSK Hub security code is: ${otp}` }
}
