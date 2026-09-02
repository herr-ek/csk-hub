"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { getPostLoginPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { PasswordResetForm } from "./password-reset-form"
import { PasswordResetRequestForm } from "./password-reset-request-form"

export function PasswordResetRequest() {
  const [isComplete, setIsComplete] = useState(false)

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 id="password-reset-title" className="font-semibold text-2xl tracking-normal">
          {isComplete ? "Check your email" : "Reset your password"}
        </h1>
        <p id="password-reset-description" className="text-muted-foreground text-sm">
          {isComplete
            ? "If an account exists for that email, you’ll receive a reset link shortly."
            : "Enter your account email and we’ll send you a password reset link."}
        </p>
      </header>
      {isComplete ? (
        <div role="status">
          <Link href={ROUTES.login} className="text-sm underline underline-offset-4">
            Return to sign in
          </Link>
        </div>
      ) : (
        <PasswordResetRequestForm onSuccess={() => setIsComplete(true)} />
      )}
    </>
  )
}

export function PasswordReset() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? undefined
  const email = searchParams.get("email") ?? ""
  const invalidLink = searchParams.get("error") === "INVALID_TOKEN" || !token
  const [freshRequested, setFreshRequested] = useState(false)

  if (invalidLink) {
    return (
      <>
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-normal">Choose a new password</h1>
          <p className="text-muted-foreground text-sm">Enter and confirm your new password.</p>
        </header>
        <Alert variant="destructive">
          <AlertDescription>This reset link is invalid or has expired. Request a new one below.</AlertDescription>
        </Alert>
        {freshRequested ? (
          <p role="status" className="text-sm text-muted-foreground">
            If an account exists for that email, you’ll receive a reset link shortly.
          </p>
        ) : (
          <PasswordResetRequestForm initialEmail={email} onSuccess={() => setFreshRequested(true)} />
        )}
      </>
    )
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 id="password-reset-title" className="font-semibold text-2xl tracking-normal">
          Choose a new password
        </h1>
        <p id="password-reset-description" className="text-muted-foreground text-sm">
          Enter your email and confirm your new password.
        </p>
      </header>
      <PasswordResetForm
        token={token}
        initialEmail={email}
        onSuccess={(role) => router.replace(getPostLoginPath(role))}
      />
    </>
  )
}
