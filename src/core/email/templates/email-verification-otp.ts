import type { EmailMessage } from "../types"

export function emailVerificationOtpTemplate(otp: string): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "Verify Your Email",
    body: `Please verify your email by entering the following OTP:\n\n${otp}\n\nIf you did not request this, please ignore this email.`
  }
}
