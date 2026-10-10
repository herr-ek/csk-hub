"use client"

import { type AnyFieldApi, useForm, useSelector } from "@tanstack/react-form"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import type z from "zod"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { passwordPolicy } from "@/shared/policy"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { toast } from "@/shared/ui/base/toast"
import { changePasswordSchema } from "./schemas"

export function PasswordSettings() {
  const t = useTranslations("AccountSettings")
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const submissionInProgress = useRef(false)

  async function onSubmit({ value }: { value: z.infer<typeof changePasswordSchema> }) {
    setMessage(null)

    let result: Awaited<ReturnType<typeof authClient.changePassword>>
    try {
      result = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true
      })
    } catch {
      try {
        await authClient.getSession()
      } catch {
        // Refresh the server-rendered session state below even if the client refresh fails.
      }
      router.refresh()
      toast.add({ type: "error", title: t("passwordChangeUnconfirmed") })
      return
    }

    if (result.error) {
      toast.add({ type: "error", title: result.error.message ?? t("passwordChangeFailed") })
      return
    }

    form.reset()
    setMessage(t("passwordChanged"))
  }

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmation: ""
    },
    validators: {
      onSubmit: changePasswordSchema
    },
    onSubmit
  })
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("passwordTitle")}</CardTitle>
        <CardDescription>{t("passwordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (submissionInProgress.current) return
            submissionInProgress.current = true
            try {
              await form.handleSubmit()
            } finally {
              submissionInProgress.current = false
            }
          }}
          noValidate
          aria-busy={isSubmitting}
        >
          <FieldGroup>
            <form.Field name="currentPassword">
              {(field) => <PasswordField field={field} label={t("currentPassword")} autoComplete="current-password" />}
            </form.Field>
            <form.Field name="newPassword">
              {(field) => (
                <PasswordField
                  field={field}
                  label={t("newPassword")}
                  autoComplete="new-password"
                  minLength={passwordPolicy.minPasswordLength}
                />
              )}
            </form.Field>
            <form.Field name="confirmation">
              {(field) => (
                <PasswordField
                  field={field}
                  label={t("confirmNewPassword")}
                  autoComplete="new-password"
                  minLength={passwordPolicy.minPasswordLength}
                />
              )}
            </form.Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("changingPassword") : t("changePassword")}
              </Button>
              {message ? (
                <Alert className="py-2">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordField({
  field,
  label,
  autoComplete,
  minLength
}: {
  field: AnyFieldApi
  label: string
  autoComplete: "current-password" | "new-password"
  minLength?: number
}) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type="password"
        autoComplete={autoComplete}
        minLength={minLength}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={isInvalid}
        required
      />
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}
