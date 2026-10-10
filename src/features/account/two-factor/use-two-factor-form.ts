"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { getPostLoginPath } from "@/core/navigation/navigation-utils"
import { getAvailableMethods, sendTwoFactorOtp, type TwoFactorMethod, verifyTwoFactorMethod } from "./service"

export function useTwoFactorForm() {
  const t = useTranslations("Public.twoFactor")
  const router = useRouter()
  const searchParams = useSearchParams()
  const methods = searchParams.get("methods")?.split(",") ?? ["totp", "otp"]
  const returnTo = searchParams.get("returnTo") ?? undefined
  const availableMethods = getAvailableMethods(methods)
  const [method, setMethod] = useState<TwoFactorMethod>(availableMethods.includes("totp") ? "totp" : "otp")
  const [code, setCode] = useState("")
  const [trustDevice, setTrustDevice] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const operationInProgress = useRef(false)

  async function sendEmailCode() {
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(undefined)
    setMessage(undefined)
    setPending(true)
    try {
      const result = await sendTwoFactorOtp()
      if (result.success) setMessage(t("emailCodeSent"))
      else setError("unavailable" in result ? t("requestFailed") : result.error)
    } finally {
      setPending(false)
      operationInProgress.current = false
    }
  }

  async function verify(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(undefined)
    setPending(true)
    try {
      const result = await verifyTwoFactorMethod(method, code, trustDevice)
      if (!result.success) {
        if ("unavailable" in result) {
          try {
            const session = await authClient.getSession()
            if (session.data?.user) {
              router.replace(getPostLoginPath(session.data.user.role, returnTo))
              return
            }
          } catch {
            // Keep the verification form available when session reconciliation also fails.
          }
          setError(t("requestFailed"))
          return
        }

        setError(result.error)
        return
      }

      router.replace(getPostLoginPath(result.role, returnTo))
    } finally {
      setPending(false)
      operationInProgress.current = false
    }
  }

  function selectMethod(nextMethod: TwoFactorMethod) {
    setMethod(nextMethod)
    setCode("")
    setError(undefined)
    setMessage(undefined)
  }

  return {
    availableMethods,
    code,
    error,
    message,
    method,
    pending,
    selectMethod,
    sendEmailCode,
    setCode,
    setTrustDevice,
    trustDevice,
    verify
  }
}
