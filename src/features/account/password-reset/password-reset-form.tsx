"use client"

import { useForm, useSelector } from "@tanstack/react-form"
import Link from "next/link"
import type { SubmitEvent } from "react"
import { useRef, useState } from "react"
import type z from "zod"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { passwordPolicy } from "@/shared/policy"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { passwordResetSchema } from "./schemas"
import { type PasswordResetCompletion, resetPassword } from "./service"

export function PasswordResetForm({
  token,
  initialEmail,
  onSuccess
}: {
  token: string
  initialEmail: string
  onSuccess: (completion: PasswordResetCompletion) => void
}) {
  const t = useTranslations("Public.passwordReset")
  const [formError, setFormError] = useState<string | null>(null)
  const submissionInProgress = useRef(false)

  async function submitPasswordReset({ value }: { value: z.infer<typeof passwordResetSchema> }) {
    setFormError(null)
    const result = await resetPassword(token, value.email, value.password)

    if (!result.success) {
      setFormError(result.error)
      return
    }

    onSuccess(result)
  }

  const form = useForm({
    defaultValues: {
      email: initialEmail,
      password: "",
      confirmPassword: ""
    },
    validators: {
      onSubmit: passwordResetSchema
    },
    onSubmit: submitPasswordReset
  })
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting)

  async function handleFormSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (submissionInProgress.current) return
    submissionInProgress.current = true
    try {
      await form.handleSubmit()
    } finally {
      submissionInProgress.current = false
    }
  }

  return (
    <form onSubmit={handleFormSubmit} noValidate aria-busy={isSubmitting} className="flex flex-col gap-4">
      <FieldGroup>
        <form.Field name="email">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>{t("email")}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>
        <form.Field name="password">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>{t("newPassword")}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  minLength={passwordPolicy.minPasswordLength}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                <FieldDescription>{t("passwordHint", { count: passwordPolicy.minPasswordLength })}</FieldDescription>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>
        <form.Field name="confirmPassword">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>{t("confirmNewPassword")}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  minLength={passwordPolicy.minPasswordLength}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
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
        {isSubmitting ? t("updating") : t("updatePassword")}
      </Button>
      <Link href={ROUTES.login} className="text-center text-sm underline underline-offset-4">
        {t("returnToSignIn")}
      </Link>
    </form>
  )
}
