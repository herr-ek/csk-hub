"use client"

import { useForm, useSelector } from "@tanstack/react-form"
import Link from "next/link"
import type { SubmitEvent } from "react"
import { useRef, useState } from "react"
import type z from "zod"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldError, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Spinner } from "@/shared/ui/base/spinner"
import { passwordResetRequestSchema } from "./schemas"
import { requestPasswordReset } from "./service"

export function PasswordResetRequestForm({
  onSuccess,
  initialEmail = ""
}: {
  onSuccess: () => void
  initialEmail?: string
}) {
  const t = useTranslations("Public.passwordReset")
  const [formError, setFormError] = useState<string | null>(null)
  const submissionInProgress = useRef(false)

  async function requestPasswordResetLink({ value }: { value: z.infer<typeof passwordResetRequestSchema> }) {
    setFormError(null)

    const result = await requestPasswordReset(value.email)

    if (!result.success) {
      setFormError(result.error)
      return
    }

    onSuccess()
  }

  const form = useForm({
    defaultValues: {
      email: initialEmail
    },
    validators: {
      onSubmit: passwordResetRequestSchema
    },
    onSubmit: requestPasswordResetLink
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
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner />
            {t("sending")}
          </>
        ) : (
          t("sendLink")
        )}
      </Button>
      <Link href={ROUTES.login} className="text-center text-sm underline underline-offset-4">
        {t("returnToSignIn")}
      </Link>
    </form>
  )
}
