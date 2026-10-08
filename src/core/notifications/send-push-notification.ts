import "server-only"

import https from "node:https"
import { and, eq, inArray, sql } from "drizzle-orm"
import webpush from "web-push"
import { app } from "@/core/config/app"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { pushSubscription } from "@/core/db/schema/notifications"
import { InvalidNotificationSubscriptionError, parseNotificationSubscription } from "./subscription-validation"
import type {
  NotificationDeliveryDiagnostics,
  NotificationDeliveryFailureCategory,
  NotificationDeliveryResult
} from "./types"

const DEFAULT_CONCURRENCY = 5
const SOCKET_IDLE_TIMEOUT_MS = 7_000
const REQUEST_DEADLINE_MS = 10_000
const BATCH_DEADLINE_MS = 30_000
const BOOKKEEPING_DEADLINE_MS = 2_000

webpush.setVapidDetails(`mailto:${env.CONTACT_EMAIL}`, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

class PushDeliveryDeadlineError extends Error {
  constructor() {
    super("Push delivery deadline exceeded")
    this.name = "PushDeliveryDeadlineError"
  }
}

type StoredSubscription = typeof pushSubscription.$inferSelect

type DeliveryAttempt = {
  accepted: boolean
  failureCategory?: NotificationDeliveryFailureCategory
  bookkeepingFailed?: boolean
}

function createDeadlineAgent() {
  const agent = new https.Agent({ keepAlive: false })
  const createConnection = agent.createConnection.bind(agent)

  agent.createConnection = ((options, callback) => {
    const socket = createConnection(options, callback)
    if (socket) {
      const deadline = setTimeout(() => socket.destroy(new PushDeliveryDeadlineError()), REQUEST_DEADLINE_MS)
      deadline.unref()
      socket.once("close", () => clearTimeout(deadline))
    }
    return socket
  }) as typeof agent.createConnection

  return agent
}

function failureCategory(error: unknown): NotificationDeliveryFailureCategory {
  if (error instanceof InvalidNotificationSubscriptionError) return "invalidSubscription"
  if (error instanceof PushDeliveryDeadlineError || (error instanceof Error && error.message === "Socket timeout"))
    return "timeout"

  const statusCode = error instanceof webpush.WebPushError ? error.statusCode : undefined
  if (statusCode === 404 || statusCode === 410) return "subscriptionGone"
  if (statusCode !== undefined) return "providerRejected"
  return "transport"
}

async function recordFailure(stored: StoredSubscription, category: NotificationDeliveryFailureCategory) {
  const permanentlyInvalid = category === "invalidSubscription" || category === "subscriptionGone"
  const now = new Date()

  await db
    .update(pushSubscription)
    .set({
      status: permanentlyInvalid ? "disabled" : "active",
      lastFailureAt: now,
      failureCount: sql`${pushSubscription.failureCount} + 1`,
      disabledAt: permanentlyInvalid ? now : null,
      disabledReason:
        category === "invalidSubscription"
          ? "Stored push subscription failed validation"
          : category === "subscriptionGone"
            ? "Push provider returned HTTP 404 or 410"
            : null,
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

async function bestEffortBookkeeping(operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation.then(
        () => true,
        () => false
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), BOOKKEEPING_DEADLINE_MS)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function deliverOne(stored: StoredSubscription, message: string): Promise<DeliveryAttempt> {
  let subscription: ReturnType<typeof parseNotificationSubscription>
  try {
    subscription = parseNotificationSubscription({
      endpoint: stored.endpoint,
      keys: { p256dh: stored.p256dh, auth: stored.auth }
    })
  } catch (error) {
    const category = failureCategory(error)
    const recorded = await bestEffortBookkeeping(recordFailure(stored, category))
    return { accepted: false, failureCategory: category, bookkeepingFailed: !recorded }
  }

  const agent = createDeadlineAgent()
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify({ title: app.name, body: message }),
      { timeout: SOCKET_IDLE_TIMEOUT_MS, agent }
    )
  } catch (error) {
    const category = failureCategory(error)
    const recorded = await bestEffortBookkeeping(recordFailure(stored, category))
    return { accepted: false, failureCategory: category, bookkeepingFailed: !recorded }
  } finally {
    agent.destroy()
  }

  // Provider acceptance is the delivery outcome. A metadata write failure must not cause a resend.
  const recorded = await bestEffortBookkeeping(recordSuccess(stored))
  return { accepted: true, bookkeepingFailed: !recorded }
}

async function deliverWithConcurrency(
  subscriptions: StoredSubscription[],
  message: string,
  concurrency: number
): Promise<DeliveryAttempt[]> {
  const results = new Array<DeliveryAttempt>(subscriptions.length)
  const deadline = Date.now() + BATCH_DEADLINE_MS
  let nextIndex = 0
  const workerCount = Math.min(concurrency, subscriptions.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (Date.now() >= deadline) {
          while (nextIndex < subscriptions.length) {
            results[nextIndex++] = { accepted: false, failureCategory: "deadline" }
          }
          return
        }

        const index = nextIndex++
        if (index >= subscriptions.length) return
        results[index] = await deliverOne(subscriptions[index], message)
      }
    })
  )

  return results
}

function incrementFailureCategory(
  failureCategories: NotificationDeliveryDiagnostics["failureCategories"],
  category: NotificationDeliveryFailureCategory
) {
  failureCategories[category] = (failureCategories[category] ?? 0) + 1
}

function logDiagnostics(diagnostics: NotificationDeliveryDiagnostics) {
  if (Object.keys(diagnostics.failureCategories).length === 0) return

  console.error("[push:delivery]", {
    accepted: diagnostics.accepted,
    failed: diagnostics.failed,
    failureCategories: diagnostics.failureCategories
  })
}

async function sendToSubscriptions(
  subscriptions: StoredSubscription[],
  message: string
): Promise<NotificationDeliveryResult> {
  if (subscriptions.length === 0) {
    return { success: false, error: "noActiveSubscriptions", accepted: 0, failed: 0, failureCategories: {} }
  }

  const attempts = await deliverWithConcurrency(subscriptions, message, DEFAULT_CONCURRENCY)
  const failureCategories: NotificationDeliveryDiagnostics["failureCategories"] = {}
  let accepted = 0

  for (const attempt of attempts) {
    if (attempt.accepted) accepted += 1
    if (attempt.failureCategory) incrementFailureCategory(failureCategories, attempt.failureCategory)
    if (attempt.bookkeepingFailed) {
      incrementFailureCategory(failureCategories, "bookkeeping")
    }
  }

  const diagnostics = { accepted, failed: subscriptions.length - accepted, failureCategories }
  logDiagnostics(diagnostics)

  if (accepted > 0) return { success: true, ...diagnostics }
  return { success: false, error: "deliveryFailed", ...diagnostics }
}

/** Delivers a message to every active push subscription belonging to one User. */
export async function sendToUser(userId: string, message: string) {
  return sendToUsers([userId], message)
}

/**
 * Delivers a message to active subscriptions for the selected Users.
 * A successful result means at least one subscription accepted the delivery.
 */
export async function sendToUsers(userIds: string[], message: string): Promise<NotificationDeliveryResult> {
  if (userIds.length === 0) {
    return { success: false, error: "noRecipients", accepted: 0, failed: 0, failureCategories: {} }
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
