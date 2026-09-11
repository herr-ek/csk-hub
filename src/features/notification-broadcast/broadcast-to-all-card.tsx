"use client"

import { useState, useTransition } from "react"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Textarea } from "@/shared/ui/base/textarea"
import { sendTestNotificationToAll } from "./actions"
import { type NotificationFeedback, NotificationFeedbackMessage } from "./notification-feedback"

export function BroadcastToAllCard() {
  const [message, setMessage] = useState("")
  const [feedback, setFeedback] = useState<NotificationFeedback | null>(null)
  const [isPending, startTransition] = useTransition()

  function sendBroadcast() {
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await sendTestNotificationToAll(message)
        setFeedback({
          success: result.success,
          message: result.success ? "Notification sent to all active subscriptions." : result.error
        })
        if (result.success) setMessage("")
      } catch {
        setFeedback({ success: false, message: "Unable to send notifications right now." })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast to all</CardTitle>
        <CardDescription>Send immediately to every active push subscription.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Enter the notification message"
          disabled={isPending}
        />
        <Button type="button" className="w-fit" onClick={sendBroadcast} disabled={isPending || !message.trim()}>
          {isPending ? "Sending..." : "Send to all"}
        </Button>
        {feedback ? <NotificationFeedbackMessage feedback={feedback} /> : null}
      </CardContent>
    </Card>
  )
}
