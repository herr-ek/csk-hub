"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  disableTwoFactor,
  enableTwoFactor,
  getAuthoritativeTwoFactorState,
  verifyTwoFactorSetup
} from "./two-factor-service"

export function useTwoFactorSettings(enabled: boolean) {
  const t = useTranslations("AccountSettings")
  const router = useRouter()
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [requestedEnabled, setRequestedEnabled] = useState<boolean>()
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [totpUri, setTotpUri] = useState<string>()
  const [backupCodes, setBackupCodes] = useState<string[]>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, setPending] = useState(false)
  const operationInProgress = useRef(false)

  useEffect(() => {
    setIsEnabled(enabled)
  }, [enabled])

  async function reconcileAfterUnavailable() {
    const authoritativeState = await getAuthoritativeTwoFactorState()
    if (authoritativeState !== undefined) setIsEnabled(authoritativeState)
    setRequestedEnabled(undefined)
    setPassword("")
    setCode("")
    setTotpUri(undefined)
    setBackupCodes(undefined)
    router.refresh()
    setError(t("twoFactorRequestFailed"))
  }

  async function changeTwoFactor(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(undefined)
    setMessage(undefined)
    setPending(true)

    try {
      if (requestedEnabled) {
        const result = await enableTwoFactor(password)
        if (!result.success) {
          if ("unavailable" in result) await reconcileAfterUnavailable()
          else setError(result.error)
          return
        }
        setTotpUri(result.totpUri)
        setBackupCodes(result.backupCodes)
        return
      }

      const result = await disableTwoFactor(password)
      if (!result.success) {
        if ("unavailable" in result) await reconcileAfterUnavailable()
        else setError(result.error)
        return
      }

      setIsEnabled(false)
      setRequestedEnabled(undefined)
      setPassword("")
      setBackupCodes(undefined)
      setMessage(t("twoFactorDisabled"))
    } finally {
      setPending(false)
      operationInProgress.current = false
    }
  }

  async function verifySetup(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(undefined)
    setPending(true)
    try {
      const result = await verifyTwoFactorSetup(code)

      if (!result.success) {
        if ("unavailable" in result) await reconcileAfterUnavailable()
        else setError(result.error)
        return
      }

      setIsEnabled(true)
      setRequestedEnabled(undefined)
      setTotpUri(undefined)
      setPassword("")
      setCode("")
      setMessage(t("authenticatorEnabled"))
    } finally {
      setPending(false)
      operationInProgress.current = false
    }
  }

  function requestChange(nextEnabled: boolean) {
    setRequestedEnabled(nextEnabled)
    setPassword("")
    setError(undefined)
    setMessage(undefined)
  }

  function cancelChange() {
    setRequestedEnabled(undefined)
    setPassword("")
    setCode("")
    setTotpUri(undefined)
    setBackupCodes(undefined)
    setError(undefined)
    setMessage(undefined)
  }

  return {
    backupCodes,
    cancelChange,
    changeTwoFactor,
    code,
    error,
    isEnabled,
    message,
    password,
    pending,
    requestChange,
    requestedEnabled,
    setCode,
    setPassword,
    totpUri,
    verifySetup
  }
}
