"use client"

import { useState } from "react"
import { disableTwoFactor, enableTwoFactor, verifyTwoFactorSetup } from "./two-factor-service"

export function useTwoFactorSettings(enabled: boolean) {
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [requestedEnabled, setRequestedEnabled] = useState<boolean>()
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [totpUri, setTotpUri] = useState<string>()
  const [backupCodes, setBackupCodes] = useState<string[]>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, setPending] = useState(false)

  async function changeTwoFactor(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)
    setPending(true)

    if (requestedEnabled) {
      const result = await enableTwoFactor(password)
      setPending(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setTotpUri(result.totpUri)
      setBackupCodes(result.backupCodes)
      return
    }

    const result = await disableTwoFactor(password)
    setPending(false)
    if (!result.success) {
      setError(result.error)
      return
    }

    setIsEnabled(false)
    setRequestedEnabled(undefined)
    setPassword("")
    setBackupCodes(undefined)
    setMessage("Two-factor authentication disabled.")
  }

  async function verifySetup(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setPending(true)
    const result = await verifyTwoFactorSetup(code)
    setPending(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setIsEnabled(true)
    setRequestedEnabled(undefined)
    setTotpUri(undefined)
    setPassword("")
    setCode("")
    setMessage("Authenticator app enabled.")
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
