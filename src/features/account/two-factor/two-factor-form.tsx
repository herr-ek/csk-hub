"use client"

import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import type { TwoFactorMethod } from "./service"
import { useTwoFactorForm } from "./use-two-factor-form"

export function TwoFactorForm() {
  const t = useTranslations("Public.twoFactor")
  const state = useTwoFactorForm()
  const methodDescription: Record<TwoFactorMethod, string> = {
    totp: t("totpDescription"),
    otp: t("otpDescription"),
    backup: t("backupDescription")
  }

  if (state.availableMethods.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("noMethod")}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {[...state.availableMethods, "backup" as const].map((availableMethod) => (
          <Button
            key={availableMethod}
            type="button"
            variant={state.method === availableMethod ? "default" : "outline"}
            onClick={() => state.selectMethod(availableMethod)}
          >
            {availableMethod === "totp"
              ? t("authenticator")
              : availableMethod === "otp"
                ? t("email")
                : t("recoveryCode")}
          </Button>
        ))}
      </div>
      <form onSubmit={state.verify}>
        <FieldGroup>
          <p className="text-sm text-muted-foreground">{methodDescription[state.method]}</p>
          {state.method === "otp" ? (
            <Button type="button" variant="outline" onClick={() => void state.sendEmailCode()} disabled={state.pending}>
              {state.pending ? t("sending") : t("sendEmailCode")}
            </Button>
          ) : null}
          <Field>
            <FieldLabel htmlFor="two-factor-code">{t("securityCode")}</FieldLabel>
            <Input
              id="two-factor-code"
              inputMode={state.method === "backup" ? "text" : "numeric"}
              autoComplete={state.method === "backup" ? "off" : "one-time-code"}
              value={state.code}
              onChange={(event) => state.setCode(event.target.value)}
              required
            />
            <FieldError>{state.error}</FieldError>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="trust-device" checked={state.trustDevice} onCheckedChange={state.setTrustDevice} />
            <FieldLabel htmlFor="trust-device" className="font-normal">
              {t("trustDevice")}
            </FieldLabel>
          </Field>
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("verifying") : t("verify")}
          </Button>
          {state.message ? (
            <Alert>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </form>
    </div>
  )
}
