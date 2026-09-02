import type { Metadata } from "next"
import { PasswordResetRequest } from "@/account/password-reset"

export const metadata: Metadata = {
  title: "Reset your password · CSK Hub"
}

export default function ForgotPasswordPage() {
  return <PasswordResetRequest />
}
