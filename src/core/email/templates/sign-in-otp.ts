import { app } from "@/core/config/app"
import type { EmailMessage } from "../types"

export function signInOtpTemplate(otp: string): Pick<EmailMessage, "subject" | "body"> {
  return { subject: "Your Sign-In OTP", body: `Your one-time password (OTP) for signing in is: ${otp}` }
}

export function twoFactorOtpTemplate(otp: string): Pick<EmailMessage, "subject" | "body"> {
  return { subject: `Your ${app.name} security code`, body: `Your ${app.name} security code is: ${otp}` }
}
