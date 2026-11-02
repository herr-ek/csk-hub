import "server-only"

import https from "node:https"
import { and, eq, getTableColumns, inArray, isNull, or, sql } from "drizzle-orm"
import webpush from "web-push"
import { app } from "@/core/config/app"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { pushSubscription } from "@/core/db/schema/notifications"
import { InvalidNotificationSubscriptionError, parseNotificationSubscription } from "./subscription-validation"
import type {
  NotificationDeliveryDiagnostics,
  NotificationDeliveryFailureCategory,
  NotificationDeliveryResult,
  PushPresentation
} from "./types"

const DEFAULT_CONCURRENCY = 5
const SOCKET_IDLE_TIMEOUT_MS = 7_000
const REQUEST_DEADLINE_MS = 10_000
const BOOKKEEPING_DEADLINE_MS = 2_000

webpush.setVapidDetails(`mailto:${env.CONTACT_EMAIL}`, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

class PushDeliveryDeadlineError extends Error {
  constructor() {
    super("Push delivery deadline exceeded")
    this.name = "PushDeliveryDeadlineError"
  }
}

type StoredSubscription = typeof pushSubscription.$inferSelect

async function withDeadline(operation: Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new PushDeliveryDeadlineError()), timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function failureCategory(error: unknown): NotificationDeliveryFailureCategory {
  if (error instanceof InvalidNotificationSubscriptionError) return "invalidSubscription"
  if (error instanceof PushDeliveryDeadlineError || (error instanceof Error && error.message === "Socket timeout"))
    return "timeout"
  const statusCode = error instanceof webpush.WebPushError ? error.statusCode : undefined
  if (statusCode === 404 || statusCode === 410) return "subscriptionGone"
  return statusCode === undefined ? "transport" : "providerRejected"
}

async function deliverOne(stored: StoredSubscription, message: string, presentation?: PushPresentation) {
  const agent = new https.Agent({ keepAlive: false })
  let category: NotificationDeliveryFailureCategory | undefined
  try {
    const subscription = parseNotificationSubscription({
      endpoint: stored.endpoint,
      keys: { p256dh: stored.p256dh, auth: stored.auth }
    })
    await withDeadline(
      webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify({
          title: presentation?.title ?? app.name,
          body: message,
          href: presentation?.href,
          tag: presentation?.tag
        }),
        { timeout: SOCKET_IDLE_TIMEOUT_MS, agent }
      ),
      REQUEST_DEADLINE_MS
    )
  } catch (error) {
    category = failureCategory(error)
  } finally {
    // Closing this attempt's sockets cancels transport when the overall deadline expires.
    agent.destroy()
  }

  let bookkeepingFailed = false
  try {
    const update = category === undefined ? recordSuccess(stored) : recordFailure(stored, category)
    await withDeadline(update, BOOKKEEPING_DEADLINE_MS)
  } catch {
    bookkeepingFailed = true
  }
  return { accepted: category === undefined, category, bookkeepingFailed }
}

async function sendToSubscriptions(
  subscriptions: StoredSubscription[],
  message: string,
  presentation?: PushPresentation
): Promise<NotificationDeliveryResult> {
  if (subscriptions.length === 0) {
    return { success: false, error: "noActiveSubscriptions", accepted: 0, failed: 0, failureCategories: {} }
  }
  let nextIndex = 0
  let accepted = 0
  const failureCategories: NotificationDeliveryDiagnostics["failureCategories"] = {}
  const countFailure = (category: NotificationDeliveryFailureCategory) => {
    failureCategories[category] = (failureCategories[category] ?? 0) + 1
  }
  await Promise.all(
    Array.from({ length: Math.min(DEFAULT_CONCURRENCY, subscriptions.length) }, async () => {
      while (nextIndex < subscriptions.length) {
        const attempt = await deliverOne(subscriptions[nextIndex++], message, presentation)
        if (attempt.accepted) accepted += 1
        if (attempt.category) countFailure(attempt.category)
        if (attempt.bookkeepingFailed) countFailure("bookkeeping")
      }
    })
  )
  const diagnostics = { accepted, failed: subscriptions.length - accepted, failureCategories }
  if (Object.keys(failureCategories).length > 0) console.error("[push:delivery]", diagnostics)
  return accepted > 0 ? { success: true, ...diagnostics } : { success: false, error: "deliveryFailed", ...diagnostics }
}

async function recordFailure(stored: StoredSubscription, category: NotificationDeliveryFailureCategory) {
  const disabledReasons: Partial<Record<NotificationDeliveryFailureCategory, string>> = {
    invalidSubscription: "Stored push subscription failed validation",
    subscriptionGone: "Push provider returned HTTP 404 or 410"
  }
  const disabledReason = disabledReasons[category] ?? null
  const permanentlyInvalid = disabledReason !== null
  const now = new Date()

  await db
    .update(pushSubscription)
    .set({
      status: permanentlyInvalid ? "disabled" : "active",
      lastFailureAt: now,
      failureCount: sql`${pushSubscription.failureCount} + 1`,
      disabledAt: permanentlyInvalid ? now : null,
      disabledReason,
      updatedAt: now
    })
    .where(eq(pushSubscription.id, stored.id))
}

async function recordSuccess(stored: StoredSubscription) {
  const now = new Date()
  await db
    .update(pushSubscription)
    .set({ lastSuccessAt: now, lastSeenAt: now, failureCount: 0, updatedAt: now })
    .where(eq(pushSubscription.id, stored.id))
}

/** Delivers a message to every active push subscription belonging to one User. */
export async function sendToUser(userId: string, message: string, presentation?: PushPresentation) {
  return sendToSubscriptions(await listDeliverySubscriptions([userId]), message, presentation)
}

/**
 * Delivers a message to active subscriptions for the selected Users.
 * A successful result means at least one subscription accepted the delivery.
 */
export async function sendToUsers(userIds: string[], message: string): Promise<NotificationDeliveryResult> {
  if (userIds.length === 0) {
    return { success: false, error: "noRecipients", accepted: 0, failed: 0, failureCategories: {} }
  }
  return sendToSubscriptions(await listDeliverySubscriptions(userIds), message)
}

/** Delivers a message to every eligible active User's push subscriptions. */
export async function sendToAll(message: string) {
  return sendToSubscriptions(await listDeliverySubscriptions(), message)
}

function listDeliverySubscriptions(userIds?: string[]) {
  return db
    .select(getTableColumns(pushSubscription))
    .from(pushSubscription)
    .innerJoin(user, eq(user.id, pushSubscription.userId))
    .where(
      and(
        eq(pushSubscription.status, "active"),
        or(eq(user.banned, false), isNull(user.banned)),
        userIds ? inArray(user.id, userIds) : undefined
      )
    )
}
