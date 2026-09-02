"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { getPostLoginPath } from "@/core/navigation/navigation-utils"
import { getAvailableMethods, sendTwoFactorOtp, type TwoFactorMethod, verifyTwoFactorMethod } from "./service"

export function useTwoFactorForm() {
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

  async function sendEmailCode() {
    setError(undefined)
    setMessage(undefined)
    setPending(true)
    const result = await sendTwoFactorOtp()
    setPending(false)
    if (result.success) setMessage("A security code was sent to your email.")
    else setError(result.error)
  }

  async function verify(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setPending(true)
    const result = await verifyTwoFactorMethod(method, code, trustDevice)
    setPending(false)
    if (!result.success) {
      setError(result.error)
      return
    }

    router.replace(getPostLoginPath(result.role, returnTo))
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
