"use client"

import QRCode from "react-qr-code"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Switch } from "@/shared/ui/base/switch"
import { useTwoFactorSettings } from "./use-two-factor-settings"

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const state = useTwoFactorSettings(enabled)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authenticator app</CardTitle>
        <CardDescription>Protect your account with a time-based one-time password.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.requestedEnabled === undefined ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              {state.isEnabled ? "Two-factor authentication is enabled." : "Require verification when signing in."}
            </p>
            <Switch
              aria-label="Enable two-factor authentication"
              checked={state.isEnabled}
              disabled={state.pending}
              onCheckedChange={state.requestChange}
            />
          </div>
        ) : state.totpUri ? (
          <form onSubmit={state.verifySetup}>
            <FieldGroup>
              <p className="font-medium">Add authenticator app</p>
              <p className="text-sm">Scan this QR code with your authenticator app, then enter the generated code.</p>
              <div className="mx-auto flex w-fit rounded-xl bg-white p-4">
                <QRCode value={state.totpUri} size={192} aria-label="Authenticator app setup QR code" />
              </div>
              <Field>
                <FieldLabel htmlFor="totp-code">Verification code</FieldLabel>
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
                  {state.pending ? "Verifying..." : "Verify and enable"}
                </Button>
                <Button type="button" variant="outline" onClick={state.cancelChange} disabled={state.pending}>
                  Cancel
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={state.changeTwoFactor}>
            <FieldGroup>
              <p className="font-medium">{state.requestedEnabled ? "Add authenticator app" : "Turn off 2FA"}</p>
              <Field>
                <FieldLabel htmlFor="totp-password">Password</FieldLabel>
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
                  {state.pending ? "Saving..." : state.requestedEnabled ? "Add authenticator app" : "Turn off 2FA"}
                </Button>
                <Button type="button" variant="outline" onClick={state.cancelChange} disabled={state.pending}>
                  Cancel
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
        {state.backupCodes?.length ? (
          <Alert className="mt-4">
            <AlertDescription>
              <p>
                Save these backup codes somewhere safe. Each code can be used once if you lose access to your
                authenticator app.
              </p>
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
