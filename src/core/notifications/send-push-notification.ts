import "server-only"

import { and, eq, inArray } from "drizzle-orm"
import webpush from "web-push"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { pushSubscription } from "@/core/db/schema/notifications"
import { getTranslations } from "@/core/i18n/server"
import type { NotificationDeliveryResult } from "./types"

webpush.setVapidDetails(`mailto:${env.CONTACT_EMAIL}`, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

async function sendToSubscriptions(
  subscriptions: (typeof pushSubscription.$inferSelect)[],
  message: string
): Promise<NotificationDeliveryResult> {
  const t = await getTranslations("PushNotifications")
  if (subscriptions.length === 0) {
    return { success: false, error: t("noActiveSubscriptions") }
  }

  const results = await Promise.allSettled(
    subscriptions.map(async (stored) => {
      try {
        await webpush.sendNotification(
          { endpoint: stored.endpoint, keys: { p256dh: stored.p256dh, auth: stored.auth } },
          JSON.stringify({ title: t("notificationTitle"), body: message })
        )
        const now = new Date()
        await db
          .update(pushSubscription)
          .set({ lastSuccessAt: now, lastSeenAt: now, failureCount: 0, updatedAt: now })
          .where(eq(pushSubscription.id, stored.id))
      } catch (error) {
        const statusCode = error instanceof webpush.WebPushError ? error.statusCode : undefined
        const permanentlyInvalid = statusCode === 404 || statusCode === 410
        const now = new Date()
        await db
          .update(pushSubscription)
          .set({
            status: permanentlyInvalid ? "disabled" : "active",
            lastFailureAt: now,
            failureCount: stored.failureCount + 1,
            disabledAt: permanentlyInvalid ? now : null,
            disabledReason: permanentlyInvalid ? `Push provider returned HTTP ${statusCode}` : null,
            updatedAt: now
          })
          .where(eq(pushSubscription.id, stored.id))
        throw error
      }
    })
  )

  return results.some((result) => result.status === "fulfilled")
    ? { success: true }
    : { success: false, error: t("deliveryFailed") }
}

/** Delivers a message to every active push subscription belonging to one Member. */
export async function sendToUser(userId: string, message: string) {
  return sendToUsers([userId], message)
}

/**
 * Delivers a message to active subscriptions for the selected Members.
 * A successful result means at least one subscription accepted the delivery.
 */
export async function sendToUsers(userIds: string[], message: string) {
  if (userIds.length === 0) {
    const t = await getTranslations("PushNotifications")
    return { success: false, error: t("noRecipients") }
  }
  const subscriptions = await db
    .select()
    .from(pushSubscription)
    .where(and(inArray(pushSubscription.userId, userIds), eq(pushSubscription.status, "active")))

  return sendToSubscriptions(subscriptions, message)
}

/** Delivers a message to every active push subscription, succeeding when at least one accepts it. */
export async function sendToAll(message: string) {
  const subscriptions = await db.select().from(pushSubscription).where(eq(pushSubscription.status, "active"))
  return sendToSubscriptions(subscriptions, message)
}
