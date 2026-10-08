import { beforeEach, describe, expect, mock, test } from "bun:test"

const requireAdmin = mock(async () => undefined)
let subscriptions: Record<string, unknown>[] = []
const where = mock(async () => subscriptions)
const select = mock(() => ({ from: () => ({ where }) }))
const updateWhere = mock(async () => undefined)
const set = mock(() => ({ where: updateWhere }))
const update = mock(() => ({ set }))
const sendNotification = mock(async () => undefined)
const getTranslations = mock(async () => {
  throw new Error("Notification actions must not resolve a rendering locale")
})
const getSession = mock(async (): Promise<{ user: { id: string } } | null> => ({ user: { id: "user-1" } }))
const subscribe = mock(async () => undefined)
const unsubscribe = mock(async () => undefined)

mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("@/core/i18n/server", () => ({ getTranslations }))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("@/core/auth", () => ({ auth: { api: { getSession } } }))
mock.module("@/core/db", () => ({ db: { select, update } }))
mock.module("web-push", () => ({
  default: { setVapidDetails: () => undefined, sendNotification, WebPushError: Error }
}))

const delivery = await import("@/core/notifications/send-push-notification")
mock.module("@/core/notifications", () => ({
  ...delivery,
  subscribe,
  unsubscribe,
  listUsersWithActiveSubscriptions: mock(async () => [])
}))
const { sendTestNotificationToAll, sendTestNotificationToUsers } = await import("./actions")
const { sendPushNotificationTest, subscribeUserToPush, unsubscribeUserFromPush } = await import(
  "../account/settings/notifications/push-notification-actions"
)

beforeEach(() => {
  subscriptions = []
  requireAdmin.mockClear()
  requireAdmin.mockResolvedValue(undefined)
  getSession.mockClear()
  getSession.mockResolvedValue({ user: { id: "user-1" } })
  getTranslations.mockClear()
  select.mockClear()
  set.mockClear()
  sendNotification.mockReset()
  sendNotification.mockResolvedValue(undefined)
  subscribe.mockClear()
  unsubscribe.mockClear()
})

const activeSubscription = {
  id: "subscription-1",
  endpoint: "https://fcm.googleapis.com/fcm/send/test-subscription",
  p256dh: "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  auth: "AAAAAAAAAAAAAAAAAAAAAA",
  failureCount: 0
}

describe("notification actions without a translation context", () => {
  test("broadcast returns a delivery error code for the UI to translate", async () => {
    expect(await sendTestNotificationToAll("Hello")).toEqual({
      success: false,
      error: "noActiveSubscriptions",
      accepted: 0,
      failed: 0,
      failureCategories: {}
    })
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(getTranslations).not.toHaveBeenCalled()
  })

  test("rejects empty messages and recipient selections before delivery", async () => {
    expect(await sendTestNotificationToAll("  ")).toEqual({ success: false, error: "messageRequired" })
    expect(await sendTestNotificationToUsers(["user-1"], "  ")).toEqual({
      success: false,
      error: "messageRequired"
    })
    expect(await sendTestNotificationToUsers([], "Hello")).toEqual({ success: false, error: "userRequired" })
    expect(select).not.toHaveBeenCalled()
    expect(getTranslations).not.toHaveBeenCalled()
  })

  test("selected delivery uses the app title and trims the message", async () => {
    subscriptions = [activeSubscription]
    expect(await sendTestNotificationToUsers(["user-1"], "  Hello  ")).toEqual({
      success: true,
      accepted: 1,
      failed: 0,
      failureCategories: {}
    })
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: activeSubscription.endpoint,
        keys: { p256dh: activeSubscription.p256dh, auth: activeSubscription.auth }
      },
      JSON.stringify({ title: "CSK Hub", body: "Hello" }),
      expect.objectContaining({ timeout: 7_000, agent: expect.any(Object) })
    )
    expect(getTranslations).not.toHaveBeenCalled()
  })

  test("delivery returns noRecipients without querying subscriptions", async () => {
    expect(await delivery.sendToUsers([], "Hello")).toEqual({
      success: false,
      error: "noRecipients",
      accepted: 0,
      failed: 0,
      failureCategories: {}
    })
    expect(select).not.toHaveBeenCalled()
  })

  test("all failed deliveries return a code and record the provider failure", async () => {
    subscriptions = [activeSubscription]
    sendNotification.mockRejectedValue(Object.assign(new Error("Gone"), { statusCode: 410 }))
    expect(await sendTestNotificationToAll("Hello")).toEqual({
      success: false,
      error: "deliveryFailed",
      accepted: 0,
      failed: 1,
      failureCategories: { subscriptionGone: 1 }
    })
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "disabled",
        disabledReason: "Push provider returned HTTP 404 or 410"
      })
    )
    expect(getTranslations).not.toHaveBeenCalled()
  })

  test("a partial delivery still succeeds", async () => {
    subscriptions = [activeSubscription, { ...activeSubscription, id: "subscription-2" }]
    sendNotification.mockRejectedValueOnce(new Error("Provider unavailable"))
    expect(await sendTestNotificationToAll("Hello")).toEqual({
      success: true,
      accepted: 1,
      failed: 1,
      failureCategories: { transport: 1 }
    })
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  test("denied admin authorization prevents delivery", async () => {
    requireAdmin.mockRejectedValue(new Error("Forbidden"))
    await expect(sendTestNotificationToAll("Hello")).rejects.toThrow("Forbidden")
    await expect(sendTestNotificationToUsers(["user-1"], "Hello")).rejects.toThrow("Forbidden")
    expect(select).not.toHaveBeenCalled()
  })

  test("account test delivery also works without translations", async () => {
    subscriptions = [activeSubscription]
    expect(await sendPushNotificationTest("Hello")).toEqual({
      success: true,
      accepted: 1,
      failed: 0,
      failureCategories: {}
    })
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(getTranslations).not.toHaveBeenCalled()
  })

  test("signed-out account actions reject before subscription changes or delivery", async () => {
    getSession.mockResolvedValue(null)
    await expect(sendPushNotificationTest("Hello")).rejects.toThrow("Unauthorized")
    await expect(
      subscribeUserToPush({ endpoint: "https://push.example.test", keys: { p256dh: "key", auth: "auth" } })
    ).rejects.toThrow("Unauthorized")
    await expect(unsubscribeUserFromPush("https://push.example.test")).rejects.toThrow("Unauthorized")
    expect(subscribe).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(getTranslations).not.toHaveBeenCalled()
  })
})
