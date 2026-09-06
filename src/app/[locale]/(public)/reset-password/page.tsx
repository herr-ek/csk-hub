import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { PasswordReset } from "@/features/account/password-reset"
import { Spinner } from "@/shared/ui/base/spinner"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Public.passwordReset" })

  return { title: t("resetPageTitle") }
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PasswordReset />
    </Suspense>
  )
}
