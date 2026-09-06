"use client"

import QRCode from "react-qr-code"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Switch } from "@/shared/ui/base/switch"
import { useTwoFactorSettings } from "./use-two-factor-settings"

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("AccountSettings")
  const common = useTranslations("Common")
  const state = useTwoFactorSettings(enabled)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("authenticatorTitle")}</CardTitle>
        <CardDescription>{t("authenticatorDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {state.requestedEnabled === undefined ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{state.isEnabled ? t("twoFactorEnabled") : t("twoFactorPrompt")}</p>
            <Switch
              aria-label={t("enableTwoFactor")}
              checked={state.isEnabled}
              disabled={state.pending}
              onCheckedChange={state.requestChange}
            />
          </div>
        ) : state.totpUri ? (
          <form onSubmit={state.verifySetup}>
            <FieldGroup>
              <p className="font-medium">{t("addAuthenticator")}</p>
              <p className="text-sm">{t("scanQr")}</p>
              <div className="mx-auto flex w-fit rounded-xl bg-white p-4">
                <QRCode value={state.totpUri} size={192} aria-label={t("authenticatorQr")} />
              </div>
              <Field>
                <FieldLabel htmlFor="totp-code">{t("verificationCode")}</FieldLabel>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  value={state.code}
                  onChange={(event) => state.setCode(event.target.value)}
                  required
                />
                <FieldError>{state.error}</FieldError>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={state.pending}>
                  {state.pending ? t("verifying") : t("verifyAndEnable")}
                </Button>
                <Button type="button" variant="outline" onClick={state.cancelChange} disabled={state.pending}>
                  {common("cancel")}
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={state.changeTwoFactor}>
            <FieldGroup>
              <p className="font-medium">{state.requestedEnabled ? t("addAuthenticator") : t("turnOffTwoFactor")}</p>
              <Field>
                <FieldLabel htmlFor="totp-password">{common("password")}</FieldLabel>
                <Input
                  id="totp-password"
                  type="password"
                  value={state.password}
                  onChange={(event) => state.setPassword(event.target.value)}
                  required
                />
                <FieldError>{state.error}</FieldError>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={state.pending}>
                  {state.pending ? t("saving") : state.requestedEnabled ? t("addAuthenticator") : t("turnOffTwoFactor")}
                </Button>
                <Button type="button" variant="outline" onClick={state.cancelChange} disabled={state.pending}>
                  {common("cancel")}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
        {state.backupCodes?.length ? (
          <Alert className="mt-4">
            <AlertDescription>
              <p>{t("backupCodes")}</p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
                {state.backupCodes.map((backupCode) => (
                  <li key={backupCode}>{backupCode}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        {state.message ? (
          <Alert className="mt-4">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
