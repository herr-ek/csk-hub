"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState, useEffect } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { InputField } from "@/shared/forms/fields"
import { passwordPolicy } from "@/shared/policy"
import { Button } from "@/shared/ui/base/button"
import { FieldError, FieldGroup } from "@/shared/ui/base/field"
import { type ActivationState, activateAccount } from "./actions"

export function ActivationForm() {
  const t = useTranslations("Public.activation")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, action, pending] = useActionState<ActivationState, FormData>(activateAccount, { status: "idle" })
  const invalidLink =
    (state.status === "error" && state.kind === "invalid-link") || searchParams.get("error") === "INVALID_TOKEN"

  useEffect(() => {
    if (state.status === "success") router.replace(state.redirectTo)
  }, [router, state])

  if (state.status === "success")
    return (
      <>
        <header>
          <h1 className="text-2xl font-semibold">{t("completeTitle")}</h1>
          <p>{t("completeDescription")}</p>
        </header>
        <Link className="underline" href={state.redirectTo}>
          {t("continue")}
        </Link>
      </>
    )

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>
      {invalidLink ? (
        <div className="space-y-2">
          <p className="text-destructive">{t("invalidLink")}</p>
          <Link className="underline" href={ROUTES.forgotPassword}>
            {t("requestFreshLink")}
          </Link>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <FieldGroup>
            <InputField
              label={t("password")}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={passwordPolicy.minPasswordLength}
            />
            <InputField
              label={t("confirmPassword")}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={passwordPolicy.minPasswordLength}
            />
            <FieldError>{state.status === "error" ? state.error : undefined}</FieldError>
          </FieldGroup>
          <Button type="submit" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </>
  )
}
