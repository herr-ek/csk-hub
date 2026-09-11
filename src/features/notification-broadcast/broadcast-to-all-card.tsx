"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Textarea } from "@/shared/ui/base/textarea"
import { sendTestNotificationToAll } from "./actions"
import { type NotificationFeedback, NotificationFeedbackMessage } from "./notification-feedback"

export function BroadcastToAllCard() {
  const t = useTranslations("PushNotifications")
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
          message: result.success ? t("sentToAll") : result.error
        })
        if (result.success) setMessage("")
      } catch {
        setFeedback({ success: false, message: t("sendAllFailed") })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("broadcastTitle")}</CardTitle>
        <CardDescription>{t("broadcastDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("messagePlaceholder")}
          disabled={isPending}
        />
        <Button type="button" className="w-fit" onClick={sendBroadcast} disabled={isPending || !message.trim()}>
          {isPending ? t("sending") : t("sendToAll")}
        </Button>
        {feedback ? <NotificationFeedbackMessage feedback={feedback} /> : null}
      </CardContent>
    </Card>
  )
}
