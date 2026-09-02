"use client"

import { type AnyFieldApi, useForm } from "@tanstack/react-form"
import { useState } from "react"
import type z from "zod"
import { authClient } from "@/core/auth/auth-client"
import { passwordPolicy } from "@/shared/policy"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { changePasswordSchema } from "./schemas"

export function PasswordSettings() {
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit({ value }: { value: z.infer<typeof changePasswordSchema> }) {
    setFormError(null)
    setMessage(null)

    const result = await authClient.changePassword({
      currentPassword: value.currentPassword,
      newPassword: value.newPassword,
      revokeOtherSessions: true
    })

    if (result.error) {
      setFormError(result.error.message ?? "Unable to change your password.")
      return
    }

    form.reset()
    setMessage("Password changed. Other sessions were signed out.")
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change your password and sign out other sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
          noValidate
          aria-busy={form.state.isSubmitting}
        >
          <FieldGroup>
            <form.Field name="currentPassword">
              {(field) => <PasswordField field={field} label="Current password" autoComplete="current-password" />}
            </form.Field>
            <form.Field name="newPassword">
              {(field) => (
                <PasswordField
                  field={field}
                  label="New password"
                  autoComplete="new-password"
                  minLength={passwordPolicy.minPasswordLength}
                />
              )}
            </form.Field>
            <form.Field name="confirmation">
              {(field) => (
                <PasswordField
                  field={field}
                  label="Confirm new password"
                  autoComplete="new-password"
                  minLength={passwordPolicy.minPasswordLength}
                />
              )}
            </form.Field>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={form.state.isSubmitting}>
                {form.state.isSubmitting ? "Changing..." : "Change password"}
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
