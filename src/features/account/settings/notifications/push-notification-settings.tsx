"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Input } from "@/shared/ui/base/input"
import { Spinner } from "@/shared/ui/base/spinner"
import { sendPushNotificationTest, subscribeMemberToPush, unsubscribeMemberFromPush } from "./push-notification-actions"

function vapidKeyToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0))
}

export function PushNotificationSettings() {
  const t = useTranslations("PushNotifications")
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const registerServiceWorker = useCallback(async () => {
    const registration = await navigator.serviceWorker.register("/service-worker.js", {
      scope: "/",
      updateViaCache: "none"
    })
    setSubscription(await registration.pushManager.getSubscription())
  }, [])

  useEffect(() => {
    if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)) return
    setIsSupported(true)
    registerServiceWorker().catch(() => setError(t("deviceEnableFailed")))
  }, [registerServiceWorker, t])

  async function subscribeToPush() {
    if (isPending) return
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      setError(t("notConfigured"))
      return
    }
    if (Notification.permission === "denied") {
      setError(t("blocked"))
      return
    }

    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setError(t("notAllowed"))
        return
      }
      const registration = await navigator.serviceWorker.ready
      const nextSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToUint8Array(vapidPublicKey)
      })
      await subscribeMemberToPush(JSON.parse(JSON.stringify(nextSubscription)))
      setSubscription(nextSubscription)
      setStatus(t("enabled"))
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "NotAllowedError") {
        setError(t("notAllowed"))
      } else {
        setError(t("subscribeFailed"))
      }
    } finally {
      setIsPending(false)
    }
  }

  async function unsubscribeFromPush() {
    if (!subscription || isPending) return
    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await unsubscribeMemberFromPush(endpoint)
      setSubscription(null)
      setStatus(t("disabled"))
    } catch {
      setError(t("unsubscribeFailed"))
    } finally {
      setIsPending(false)
    }
  }

  async function sendTest() {
    if (!subscription || isPending) return
    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const result = await sendPushNotificationTest(message.trim() || t("defaultTestMessage"))
      if (result.success) {
        setMessage("")
        setStatus(t("testSent"))
      } else {
        setError(result.error)
      }
    } catch {
      setError(t("testSendFailed"))
    } finally {
      setIsPending(false)
    }
  }

  if (!isSupported) return <p className="text-sm text-muted-foreground">{t("notSupported")}</p>

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settingsTitle")}</CardTitle>
        <CardDescription>{t("settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {subscription ? (
          <>
            <p className="text-sm text-muted-foreground">{t("enabled")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={unsubscribeFromPush} disabled={isPending}>
                {isPending ? t("saving") : t("disable")}
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder={t("testMessagePlaceholder")}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={isPending}
              />
              <Button type="button" onClick={sendTest} disabled={isPending}>
                {isPending ? t("sending") : t("sendTest")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("disabled")}</p>
            <Button type="button" onClick={subscribeToPush} className="w-fit" disabled={isPending}>
              {isPending ? <Spinner aria-hidden="true" /> : null}
              {isPending ? t("enabling") : t("enable")}
            </Button>
          </>
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
