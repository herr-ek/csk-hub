"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { getPostLoginPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { PasswordResetForm } from "./password-reset-form"
import { PasswordResetRequestForm } from "./password-reset-request-form"

export function PasswordResetRequest() {
  const t = useTranslations("Public.passwordReset")
  const [isComplete, setIsComplete] = useState(false)

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 id="password-reset-title" className="font-semibold text-2xl tracking-normal">
          {isComplete ? t("completeTitle") : t("requestTitle")}
        </h1>
        <p id="password-reset-description" className="text-muted-foreground text-sm">
          {isComplete ? t("completeDescription") : t("requestDescription")}
        </p>
      </header>
      {isComplete ? (
        <div role="status">
          <Link href={ROUTES.login} className="text-sm underline underline-offset-4">
            {t("returnToSignIn")}
          </Link>
        </div>
      ) : (
        <PasswordResetRequestForm onSuccess={() => setIsComplete(true)} />
      )}
    </>
  )
}

export function PasswordReset() {
  const t = useTranslations("Public.passwordReset")
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? undefined
  const email = searchParams.get("email") ?? ""
  const invalidLink = searchParams.get("error") === "INVALID_TOKEN" || !token
  const [freshRequested, setFreshRequested] = useState(false)

  if (invalidLink) {
    return (
      <>
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-normal">{t("newPasswordTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("newPasswordDescription")}</p>
        </header>
        <Alert variant="destructive">
          <AlertDescription>{t("invalidLink")}</AlertDescription>
        </Alert>
        {freshRequested ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("completeDescription")}
          </p>
        ) : (
          <PasswordResetRequestForm initialEmail={email} onSuccess={() => setFreshRequested(true)} />
        )}
      </>
    )
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 id="password-reset-title" className="font-semibold text-2xl tracking-normal">
          {t("newPasswordTitle")}
        </h1>
        <p id="password-reset-description" className="text-muted-foreground text-sm">
          {t("resetDescription")}
        </p>
      </header>
      <PasswordResetForm
        token={token}
        initialEmail={email}
        onSuccess={(role) => router.replace(getPostLoginPath(role))}
      />
    </>
  )
}
