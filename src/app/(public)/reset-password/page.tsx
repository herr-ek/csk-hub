import type { Metadata } from "next"
import { Suspense } from "react"
import { PasswordReset } from "@/features/account/password-reset"
import { Spinner } from "@/shared/ui/base/spinner"

export const metadata: Metadata = {
  title: "Choose a new password · CSK Hub"
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PasswordReset />
    </Suspense>
  )
}
