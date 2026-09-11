"use client"

import { useCallback, useEffect, useState } from "react"
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
    registerServiceWorker().catch(() => setError("The app could not enable push notifications on this device."))
  }, [registerServiceWorker])

  async function subscribeToPush() {
    if (isPending) return
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      setError("Push notifications are not configured yet.")
      return
    }
    if (Notification.permission === "denied") {
      setError("Notifications are blocked for this site. Allow them in your browser settings to subscribe.")
      return
    }

    setError(null)
    setStatus(null)
    setIsPending(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setError("Notifications were not allowed. You can enable them later in your browser settings.")
        return
      }
      const registration = await navigator.serviceWorker.ready
      const nextSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToUint8Array(vapidPublicKey)
      })
      await subscribeMemberToPush(JSON.parse(JSON.stringify(nextSubscription)))
      setSubscription(nextSubscription)
      setStatus("Push notifications are enabled on this device.")
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "NotAllowedError") {
        setError("Notifications were not allowed. You can enable them later in your browser settings.")
      } else {
        setError("Unable to subscribe to push notifications right now.")
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
      setStatus("Push notifications are disabled on this device.")
    } catch {
      setError("Unable to unsubscribe from push notifications right now.")
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
      const result = await sendPushNotificationTest(message.trim() || "This is a test notification from CSK Hub.")
      if (result.success) {
        setMessage("")
        setStatus("Test notification sent.")
      } else {
        setError(result.error)
      }
    } catch {
      setError("Unable to send a test notification right now.")
    } finally {
      setIsPending(false)
    }
  }

  if (!isSupported)
    return <p className="text-sm text-muted-foreground">Push notifications are not supported in this browser.</p>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push notifications</CardTitle>
        <CardDescription>Receive updates from CSK Hub, even when the app is not open.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {subscription ? (
          <>
            <p className="text-sm text-muted-foreground">Push notifications are enabled on this device.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={unsubscribeFromPush} disabled={isPending}>
                {isPending ? "Saving..." : "Disable notifications"}
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Enter a test message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={isPending}
              />
              <Button type="button" onClick={sendTest} disabled={isPending}>
                {isPending ? "Sending..." : "Send test"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Push notifications are disabled on this device.</p>
            <Button type="button" onClick={subscribeToPush} className="w-fit" disabled={isPending}>
              {isPending ? <Spinner aria-hidden="true" /> : null}
              {isPending ? "Enabling..." : "Enable notifications"}
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
