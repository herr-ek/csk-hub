"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState, useEffect } from "react"
import { ROUTES } from "@/core/navigation/site"
import { passwordPolicy } from "@/shared/policy"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { type ActivationState, activateAccount } from "./actions"

export function ActivationForm() {
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
          <h1 className="text-2xl font-semibold">Account activated</h1>
          <p>Taking you to CSK Hub…</p>
        </header>
        <Link className="underline" href={state.redirectTo}>
          Continue to CSK Hub
        </Link>
      </>
    )

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Activate your CSK account</h1>
        <p className="text-muted-foreground">Set a password to finish creating your account.</p>
      </header>
      {invalidLink ? (
        <div className="space-y-2">
          <p className="text-destructive">This activation link is invalid or has expired.</p>
          <Link className="underline" href={ROUTES.forgotPassword}>
            Request a fresh password link
          </Link>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="activation-password">Password</FieldLabel>
              <Input
                id="activation-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={passwordPolicy.minPasswordLength}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="activation-confirm-password">Confirm password</FieldLabel>
              <Input
                id="activation-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={passwordPolicy.minPasswordLength}
              />
            </Field>
            <FieldError>{state.status === "error" ? state.error : undefined}</FieldError>
          </FieldGroup>
          <Button type="submit" disabled={pending}>
            {pending ? "Activating" : "Activate account"}
          </Button>
        </form>
      )}
    </>
  )
}
