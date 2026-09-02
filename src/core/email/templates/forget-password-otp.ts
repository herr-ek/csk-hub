import type { EmailMessage } from "../types"

export function forgetPasswordOtpTemplate(otp: string): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "Reset Your Password",
    body: `You have requested to reset your password. Please enter the following code to reset it:\n\n${otp}\n\nIf you did not request this, please ignore this email.`
  }
}
