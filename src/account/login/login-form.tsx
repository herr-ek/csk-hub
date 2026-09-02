"use client"

import { useForm, useSelector } from "@tanstack/react-form"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import type z from "zod"
import { getPostLoginPath, twoFactorPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Spinner } from "@/shared/ui/base/spinner"
import { loginSchema } from "./schemas"
import { type LoginResult, signInWithIdentifier, signInWithPasskey } from "./service"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo") ?? undefined
  const [formError, setFormError] = useState<string | null>(null)
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false)

  function completeSignIn(result: LoginResult) {
    if (!result.success) {
      if ("requiresTwoFactor" in result) {
        router.replace(twoFactorPath(result.methods, returnTo))
        return
      }
      setFormError(result.error)
      return
    }

    router.replace(getPostLoginPath(result.role, returnTo))
  }

  async function handlePasskeySignIn() {
    setFormError(null)

    setIsPasskeySubmitting(true)
    const result = await signInWithPasskey()
    setIsPasskeySubmitting(false)
    completeSignIn(result)
  }

  async function onSubmit({ value }: { value: z.infer<typeof loginSchema> }) {
    setFormError(null)

    const result = await signInWithIdentifier({
      identifier: value.identifier,
      password: value.password,
      rememberMe: value.rememberMe
    })
    completeSignIn(result)
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
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting)

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
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email or username</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Email or username"
                  autoComplete="username"
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
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Password"
                  autoComplete="current-password"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
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
                  Keep me signed in
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
        {isSubmitting ? (
          <>
            <Spinner />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
      <div className="relative flex items-center justify-center">
        <span className="absolute inset-x-0 border-t" />
        <span className="relative bg-background px-2 text-muted-foreground text-xs">or</span>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={handlePasskeySignIn}
        disabled={isSubmitting || isPasskeySubmitting}
      >
        {isPasskeySubmitting ? "Waiting for passkey..." : "Sign in with a passkey"}
      </Button>
      <Link href={ROUTES.forgotPassword} className="text-center text-sm underline underline-offset-4">
        Forgot your password?
      </Link>
    </form>
  )
}
