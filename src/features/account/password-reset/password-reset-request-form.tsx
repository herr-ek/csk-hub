"use client"

import { useForm } from "@tanstack/react-form"
import Link from "next/link"
import { useState } from "react"
import type z from "zod"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { InputField } from "@/shared/forms/fields"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
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

  async function onSubmit({ value }: { value: z.infer<typeof passwordResetRequestSchema> }) {
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
    onSubmit
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
      noValidate
      aria-busy={form.state.isSubmitting}
      className="flex flex-col gap-4"
    >
      <form.Field name="email">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <InputField
              label={t("email")}
              name={field.name}
              type="email"
              autoComplete="email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              invalid={isInvalid}
              errors={isInvalid ? field.state.meta.errors : undefined}
            />
          )
        }}
      </form.Field>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={form.state.isSubmitting}>
        {form.state.isSubmitting ? (
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
