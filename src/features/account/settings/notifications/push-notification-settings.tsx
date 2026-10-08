"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Input } from "@/shared/ui/base/input"
import { Spinner } from "@/shared/ui/base/spinner"
import {
  isPushSubscriptionBoundToCurrentUser,
  sendPushNotificationTest,
  subscribeUserToPush,
  unsubscribeUserFromPush
} from "./push-notification-actions"

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
  const [isBound, setIsBound] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const loadSubscriptionState = useCallback(async () => {
    setIsBound(null)
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none"
      })
      const browserSubscription = await registration.pushManager.getSubscription()
      setSubscription(browserSubscription)
      setIsBound(browserSubscription ? await isPushSubscriptionBoundToCurrentUser(browserSubscription.endpoint) : false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)) return
    setIsSupported(true)
    loadSubscriptionState().catch(() => {
      setIsLoading(false)
      setError(t("deviceEnableFailed"))
    })
    const refreshOnFocus = () => {
      setIsLoading(true)
      loadSubscriptionState().catch(() => setError(t("deviceEnableFailed")))
    }
    window.addEventListener("focus", refreshOnFocus)
    return () => window.removeEventListener("focus", refreshOnFocus)
  }, [loadSubscriptionState, t])

  async function subscribeToPush() {
    if (isPending) return
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!subscription && !vapidPublicKey) {
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
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission()
      if (permission !== "granted") {
        setError(t("notAllowed"))
        return
      }
      const registration = await navigator.serviceWorker.ready
      let nextSubscription = subscription
      if (!nextSubscription) {
        if (!vapidPublicKey) {
          setError(t("notConfigured"))
          return
        }
        nextSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyToUint8Array(vapidPublicKey)
        })
      }
      setSubscription(nextSubscription)
      setIsBound(false)
      await subscribeUserToPush(JSON.parse(JSON.stringify(nextSubscription)))
      setSubscription(nextSubscription)
      setIsBound(true)
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
    if (!subscription || isPending || !isBound) return
    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const endpoint = subscription.endpoint
      const result = await unsubscribeUserFromPush(endpoint)
      if (!result.removed) {
        setIsBound(false)
        return
      }
      setIsBound(false)
      const removedFromBrowser = await subscription.unsubscribe()
      if (removedFromBrowser) setSubscription(null)
      setStatus(t("disabled"))
    } catch {
      setError(t("unsubscribeFailed"))
    } finally {
      setIsPending(false)
    }
  }

  async function removeUnboundSubscription() {
    if (!subscription || isPending || isBound !== false) return
    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const removedFromBrowser = await subscription.unsubscribe()
      if (!removedFromBrowser) throw new Error("Browser did not remove the push subscription")
      setSubscription(null)
      setIsBound(false)
      setStatus(t("disabled"))
    } catch {
      setError(t("unsubscribeFailed"))
    } finally {
      setIsPending(false)
    }
  }

  async function sendTest() {
    if (!subscription || isPending || !isBound) return
    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const result = await sendPushNotificationTest(message.trim() || t("defaultTestMessage"))
      if (result.success) {
        setMessage("")
        setStatus(t("testSent"))
      } else {
        setError(t(result.error))
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
        {isLoading ? (
          <Spinner aria-label={t("saving")} />
        ) : isBound === null ? null : subscription && isBound ? (
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
            <p className="text-sm text-muted-foreground">{subscription ? t("unbound") : t("disabled")}</p>
            <Button type="button" onClick={subscribeToPush} className="w-fit" disabled={isPending}>
              {isPending ? <Spinner aria-hidden="true" /> : null}
              {isPending
                ? subscription
                  ? t("reconnecting")
                  : t("enabling")
                : subscription
                  ? t("reconnect")
                  : t("enable")}
            </Button>
            {subscription && isBound === false ? (
              <Button type="button" variant="outline" onClick={removeUnboundSubscription} disabled={isPending}>
                {isPending ? t("saving") : t("removeFromBrowser")}
              </Button>
            ) : null}
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
