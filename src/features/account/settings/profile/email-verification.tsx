"use client"

import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/shared/ui/base/dialog"
import { Field, FieldError, FieldLabel } from "@/shared/ui/base/field"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/ui/base/input-otp"
import { sendEmailVerificationOtp, verifyEmailOtp } from "./email-verification-service"

export function EmailVerification({ email, initialVerified }: { email: string; initialVerified: boolean }) {
  const t = useTranslations("AccountSettings")
  const [verified, setVerified] = useState(initialVerified)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  async function sendCode() {
    setError(undefined)
    setMessage(undefined)
    setIsSending(true)

    try {
      const result = await sendEmailVerificationOtp(email)
      if (!result.success) {
        setError(result.error)
        return false
      }

      setMessage(t("verificationSent", { email }))
      return true
    } catch {
      setError(t("sendVerificationFailed"))
      return false
    } finally {
      setIsSending(false)
    }
  }

  async function startVerification() {
    if (await sendCode()) setOpen(true)
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (code.length !== 6 || isVerifying) return

    setError(undefined)
    setIsVerifying(true)
    try {
      const result = await verifyEmailOtp(email, code)
      if (!result.success) {
        setError(result.error)
        return
      }

      setVerified(true)
      setOpen(false)
      setCode("")
    } catch {
      setError(t("verifyCodeFailed"))
    } finally {
      setIsVerifying(false)
    }
  }

  if (verified) {
    return (
      <div className="flex items-center gap-2">
        <span className="break-all">{email}</span>
        <CircleCheckIcon className="size-4 shrink-0 text-green-600" aria-label={t("emailVerified")} />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="break-all">{email}</span>
        <TriangleAlertIcon className="size-4 shrink-0 text-yellow-500" aria-label={t("emailNotVerified")} />
      </div>
      <div className="mt-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void startVerification()} disabled={isSending}>
          {isSending ? t("sending") : t("verify")}
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isVerifying) setOpen(nextOpen)
        }}
      >
        <DialogContent showCloseButton={!isVerifying}>
          <DialogHeader>
            <DialogTitle>{t("verifyEmailTitle")}</DialogTitle>
            <DialogDescription>{t("verifyEmailDescription", { email })}</DialogDescription>
          </DialogHeader>
          <form onSubmit={verify}>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="email-verification-code">{t("verificationCode")}</FieldLabel>
              <div className="flex justify-center">
                <InputOTP
                  id="email-verification-code"
                  value={code}
                  onChange={setCode}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-invalid={Boolean(error)}
                  disabled={isVerifying}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <FieldError>{error}</FieldError>
            </Field>
            {message ? (
              <Alert className="mt-4 py-2">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => void sendCode()}
                disabled={isSending || isVerifying}
              >
                {isSending ? t("sending") : t("resendCode")}
              </Button>
              <Button type="submit" disabled={code.length !== 6 || isVerifying}>
                {isVerifying ? t("verifying") : t("verifyEmail")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
