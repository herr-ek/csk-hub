"use client"

import { useForm, useSelector } from "@tanstack/react-form"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import type z from "zod"
import { withOAuthQuery } from "@/core/auth/oauth-continuation"
import { useTranslations } from "@/core/i18n/translations"
import { getPostLoginPath, twoFactorPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { InputField } from "@/shared/forms/fields"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Spinner } from "@/shared/ui/base/spinner"
import { loginSchema } from "./schemas"
import { type LoginResult, signInWithIdentifier, signInWithPasskey } from "./service"

export function LoginForm() {
  const t = useTranslations("Public.login")
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo") ?? undefined
  const [formError, setFormError] = useState<string | null>(null)
  const [signInMethod, setSignInMethod] = useState<"password" | "passkey">()
  const signInInProgress = useRef(false)

  async function submitSignIn(method: "password" | "passkey", signIn: () => Promise<LoginResult>) {
    if (signInInProgress.current) return
    signInInProgress.current = true
    setSignInMethod(method)
    setFormError(null)

    const result = await signIn()
    if (result.success) {
      if (!result.redirecting) router.replace(getPostLoginPath(result.role, returnTo))
    } else if ("requiresTwoFactor" in result) {
      router.replace(withOAuthQuery(twoFactorPath(result.methods, returnTo), searchParams.toString()))
    } else {
      setFormError(t(`errors.${result.error}`))
      signInInProgress.current = false
      setSignInMethod(undefined)
    }
  }

  async function onSubmit({ value }: { value: z.infer<typeof loginSchema> }) {
    await submitSignIn("password", () => signInWithIdentifier(value))
  }

  const form = useForm({
    defaultValues: {
      identifier: "",
      password: "",
      rememberMe: false
    },
    validators: {
      onSubmit: loginSchema
    },
    onSubmit
  })
  const isFormSubmitting = useSelector(form.store, (state) => state.isSubmitting)
  const isPasswordSubmitting = isFormSubmitting || signInMethod === "password"
  const isPasskeySubmitting = signInMethod === "passkey"
  const isSubmitting = isPasswordSubmitting || isPasskeySubmitting

  return (
    <form
      id="login-form"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      aria-busy={isSubmitting}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <form.Field name="identifier">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <InputField
                label={t("identifier")}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={t("identifier")}
                autoComplete="username"
                invalid={isInvalid}
                errors={isInvalid ? field.state.meta.errors : undefined}
              />
            )
          }}
        </form.Field>
        <form.Field name="password">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <InputField
                label={t("password")}
                name={field.name}
                type="password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={t("password")}
                autoComplete="current-password"
                invalid={isInvalid}
                errors={isInvalid ? field.state.meta.errors : undefined}
              />
            )
          }}
        </form.Field>
        <form.Field name="rememberMe">
          {(field) => {
            return (
              <Field orientation="horizontal">
                <Checkbox
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
                <FieldLabel htmlFor={field.name} className="font-normal">
                  {t("rememberMe")}
                </FieldLabel>
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isPasswordSubmitting ? (
          <>
            <Spinner />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
      <div className="relative flex items-center justify-center">
        <span className="absolute inset-x-0 border-t" />
        <span className="relative bg-background px-2 text-muted-foreground text-xs">{t("or")}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => submitSignIn("passkey", signInWithPasskey)}
        disabled={isSubmitting}
      >
        {isPasskeySubmitting ? t("passkeyPending") : t("passkey")}
      </Button>
      <Link href={ROUTES.forgotPassword} className="text-center text-sm underline underline-offset-4">
        {t("forgotPassword")}
      </Link>
    </form>
  )
}
