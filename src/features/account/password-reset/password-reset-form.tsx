"use client"

import { useForm } from "@tanstack/react-form"
import Link from "next/link"
import { useState } from "react"
import type z from "zod"
import { ROUTES } from "@/core/navigation/site"
import { passwordPolicy } from "@/shared/policy"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { passwordResetSchema } from "./schemas"
import { resetPassword } from "./service"

export function PasswordResetForm({
  token,
  initialEmail,
  onSuccess
}: {
  token: string
  initialEmail: string
  onSuccess: (role?: string | null) => void
}) {
  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit({ value }: { value: z.infer<typeof passwordResetSchema> }) {
    setFormError(null)
    const result = await resetPassword(token, value.email, value.password)

    if (!result.success) {
      setFormError(result.error)
      return
    }

    onSuccess(result.signIn.role)
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
      <FieldGroup>
        <form.Field name="email">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
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
                <FieldLabel htmlFor={field.name}>New password</FieldLabel>
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
                <FieldDescription>{passwordPolicy.minPasswordLengthHint}</FieldDescription>
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
                <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
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
      <Button type="submit" disabled={form.state.isSubmitting}>
        {form.state.isSubmitting ? "Updating..." : "Update password"}
      </Button>
      <Link href={ROUTES.login} className="text-center text-sm underline underline-offset-4">
        Return to sign in
      </Link>
    </form>
  )
}
