"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { disableTwoFactor, enableTwoFactor, verifyTwoFactorSetup } from "./two-factor-service"

type Step = { kind: "idle" } | { kind: "confirm"; enable: boolean } | { kind: "verify"; totpUri: string }
type Feedback = { type: "error" | "success"; message: string }

export function useTwoFactorSettings() {
  const t = useTranslations("AccountSettings")
  const router = useRouter()
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const [backupCodes, setBackupCodes] = useState<string[]>()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pending, setPending] = useState(false)
  const operationInProgress = useRef(false)

  async function runPendingOperation(operation: () => Promise<void>) {
    if (operationInProgress.current) return
    operationInProgress.current = true
    setPending(true)
    try {
      await operation()
    } finally {
      setPending(false)
      operationInProgress.current = false
    }
  }

  async function reconcileAfterUnavailable() {
    setStep({ kind: "idle" })
    setBackupCodes(undefined)
    router.refresh()
    setFeedback({ type: "error", message: t("twoFactorRequestFailed") })
  }

  function changeTwoFactor(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = String(formData.get("password") ?? "")

    void runPendingOperation(async () => {
      setFeedback(null)
      if (step.kind !== "confirm") return

      if (step.enable) {
        const result = await enableTwoFactor(password)
        if (!result.success) {
          if ("unavailable" in result) await reconcileAfterUnavailable()
          else setFeedback({ type: "error", message: result.error })
          return
        }

        setBackupCodes(result.backupCodes)
        if (result.totpUri) setStep({ kind: "verify", totpUri: result.totpUri })
        return
      }

      const result = await disableTwoFactor(password)
      if (!result.success) {
        if ("unavailable" in result) await reconcileAfterUnavailable()
        else setFeedback({ type: "error", message: result.error })
        return
      }

      setStep({ kind: "idle" })
      setBackupCodes(undefined)
      setFeedback({ type: "success", message: t("twoFactorDisabled") })
      router.refresh()
    })
  }

  function verifySetup(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const code = String(formData.get("code") ?? "")

    void runPendingOperation(async () => {
      setFeedback(null)
      const result = await verifyTwoFactorSetup(code)

      if (!result.success) {
        if ("unavailable" in result) await reconcileAfterUnavailable()
        else setFeedback({ type: "error", message: result.error })
        return
      }

      setStep({ kind: "idle" })
      setFeedback({ type: "success", message: t("authenticatorEnabled") })
      router.refresh()
    })
  }

  function requestChange(enable: boolean) {
    setStep({ kind: "confirm", enable })
    setFeedback(null)
  }

  function cancelChange() {
    setStep({ kind: "idle" })
    setBackupCodes(undefined)
    setFeedback(null)
  }

  return {
    backupCodes,
    cancelChange,
    changeTwoFactor,
    feedback,
    pending,
    requestChange,
    step,
    verifySetup
  }
}
