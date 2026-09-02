import "server-only"

import { logger } from "@/core/logging"
import { sendEmail } from "../client"
import { emailVerificationOtpTemplate } from "../templates/email-verification-otp"
import { forgetPasswordOtpTemplate } from "../templates/forget-password-otp"
import { magicLinkTemplate } from "../templates/magic-link"
import { resetPasswordTemplate } from "../templates/reset-password"
import { signInOtpTemplate, twoFactorOtpTemplate } from "../templates/sign-in-otp"
import type { EmailMessage } from "../types"

class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed.")
  }
}

async function dispatch(message: EmailMessage) {
  const result = await sendEmail(message)
  if (!result.ok) throw new EmailDeliveryError()
}

export async function sendResetPasswordEmail({ user, url }: { user: { email: string; name: string }; url: string }) {
  const template = resetPasswordTemplate({ name: user.name, url })
  await dispatch({ to: user.email, subject: template.subject, body: template.body })
}

export async function sendVerificationOtpEmail({
  email,
  otp,
  type
}: {
  email: string
  otp: string
  type: "sign-in" | "email-verification" | "forget-password" | "change-email"
}) {
  let template: { subject: string; body: string }

  switch (type) {
    case "sign-in":
      template = signInOtpTemplate(otp)
      break
    case "email-verification":
      template = emailVerificationOtpTemplate(otp)
      break
    case "forget-password":
      template = forgetPasswordOtpTemplate(otp)
      break
    case "change-email":
      throw Error("OTP type not implemented")
  }

  await dispatch({ to: email, subject: template.subject, body: template.body })
  logger.info("auth.otp.dispatched", { type })
}

export async function sendTwoFactorOtpEmail({ email, otp }: { email: string; otp: string }) {
  const template = twoFactorOtpTemplate(otp)
  await dispatch({ to: email, subject: template.subject, body: template.body })
  logger.info("auth.two_factor_otp.dispatched", { email })
}

export async function sendMagicLinkEmail({ email, url }: { email: string; url: string }) {
  const template = magicLinkTemplate(url)
  await dispatch({ to: email, subject: template.subject, body: template.body })
  logger.info("auth.magic-link.dispatched", { email })
}
