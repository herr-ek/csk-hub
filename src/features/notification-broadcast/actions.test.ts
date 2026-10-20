import { afterEach, beforeEach, describe, expect, jest, mock, spyOn, test } from "bun:test"
import { createECDH } from "node:crypto"
import https from "node:https"

const requireAdmin = mock(async () => undefined)
let subscriptions: Record<string, unknown>[] = []
const where = mock(async () => subscriptions)
const select = mock(() => ({ from: () => ({ innerJoin: () => ({ where }) }) }))
const updateWhere = mock(async () => undefined)
const set = mock(() => ({ where: updateWhere }))
const update = mock(() => ({ set }))
const sendNotification = mock(
  async (_subscription: unknown, _payload: string, _options: { agent: https.Agent; timeout: number }): Promise<void> =>
    undefined
)
const getTranslations = mock(async () => {
  throw new Error("Notification actions must not resolve a rendering locale")
})
const getSession = mock(
  async (): Promise<{ user: { id: string }; session: { impersonatedBy?: string } } | null> => ({
    user: { id: "user-1" },
    session: {}
  })
)
const subscribe = mock(async () => undefined)
const unsubscribe = mock(async () => false)
const hasActiveSubscription = mock(async () => true)

mock.module("@/core/authz", () => ({
  requirePermission: async (request: { action: string }) => {
    if (request.action === "notification.broadcast") return requireAdmin()
    const session = await getSession()
    if (!session) throw new Error("Unauthorized")
    return { userId: session.user.id }
  }
}))
mock.module("@/core/i18n/server", () => ({ getTranslations }))
mock.module("@/core/auth/session.server", () => ({
  getRequestSession: getSession
}))
mock.module("@/core/db", () => ({
  db: { select, update, transaction: async (run: (tx: unknown) => Promise<unknown>) => run({}) }
}))
mock.module("web-push", () => ({
  default: { setVapidDetails: () => undefined, sendNotification, WebPushError: Error }
}))

const delivery = await import("@/core/notifications/send-push-notification")
mock.module("@/core/notifications", () => ({
  ...delivery,
  hasActiveSubscription,
  subscribe,
  unsubscribe,
  listUsersWithActiveSubscriptions: mock(async () => [])
}))
const { sendTestNotificationToAll, sendTestNotificationToUsers } = await import("./actions")
const { getPushSubscriptionBinding, sendPushNotificationTest, subscribeUserToPush, unsubscribeUserFromPush } =
  await import("../account/settings/notifications/push-notification-actions")

beforeEach(() => {
  subscriptions = []
  requireAdmin.mockClear()
  requireAdmin.mockResolvedValue(undefined)
  getSession.mockClear()
  getSession.mockResolvedValue({ user: { id: "user-1" }, session: {} })
  getTranslations.mockClear()
  select.mockClear()
  updateWhere.mockClear()
  set.mockClear()
  sendNotification.mockReset()
  sendNotification.mockResolvedValue(undefined)
  subscribe.mockClear()
  unsubscribe.mockReset().mockResolvedValue(false)
  hasActiveSubscription.mockReset().mockResolvedValue(true)
})

const activeSubscription = {
  id: "subscription-1",
  endpoint: "https://fcm.googleapis.com/fcm/send/test-subscription",
  p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
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
      expect.objectContaining({ agent: expect.any(Object) })
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

const { InvalidNotificationSubscriptionError } = await import("@/core/notifications/subscription-validation")
const { revokePushBindingBeforeLogout } = await import("@/core/navigation/logout-actions")

test("binding lookup distinguishes owned, missing, unsupported, and unavailable", async () => {
  expect(await getPushSubscriptionBinding(activeSubscription.endpoint)).toBe("bound")
  expect(hasActiveSubscription).toHaveBeenCalledWith("user-1", activeSubscription.endpoint)
  hasActiveSubscription.mockResolvedValue(false)
  expect(await getPushSubscriptionBinding(activeSubscription.endpoint)).toBe("unbound")
  hasActiveSubscription.mockRejectedValue(new InvalidNotificationSubscriptionError())
  expect(await getPushSubscriptionBinding(activeSubscription.endpoint)).toBe("unsupported")
  hasActiveSubscription.mockRejectedValue(new Error("Database unavailable"))
  await expect(getPushSubscriptionBinding(activeSubscription.endpoint)).rejects.toThrow("Database unavailable")
})

test("impersonation cannot inspect, rebind, remove, or test push subscriptions", async () => {
  getSession.mockResolvedValue({ user: { id: "user-1" }, session: { impersonatedBy: "admin-1" } })
  for (const operation of [
    () => getPushSubscriptionBinding(activeSubscription.endpoint),
    () =>
      subscribeUserToPush({
        endpoint: activeSubscription.endpoint,
        keys: { p256dh: activeSubscription.p256dh, auth: activeSubscription.auth }
      }),
    () => unsubscribeUserFromPush(activeSubscription.endpoint),
    () => sendPushNotificationTest("Hello")
  ]) {
    await expect(operation()).rejects.toThrow("Push notifications are unavailable while impersonating")
  }
  expect(hasActiveSubscription).not.toHaveBeenCalled()
  expect(subscribe).not.toHaveBeenCalled()
  expect(unsubscribe).not.toHaveBeenCalled()
  expect(select).not.toHaveBeenCalled()
})

test("signed-out binding lookup rejects before inspecting subscriptions", async () => {
  getSession.mockResolvedValue(null)
  await expect(getPushSubscriptionBinding(activeSubscription.endpoint)).rejects.toThrow("Unauthorized")
  expect(hasActiveSubscription).not.toHaveBeenCalled()
})

test("logout revocation uses only the authenticated owner and reports whether removal occurred", async () => {
  unsubscribe.mockResolvedValue(true)
  expect(await revokePushBindingBeforeLogout(activeSubscription.endpoint)).toBe(true)
  expect(unsubscribe).toHaveBeenCalledWith("user-1", activeSubscription.endpoint)
  unsubscribe.mockResolvedValue(false)
  expect(await revokePushBindingBeforeLogout(activeSubscription.endpoint)).toBe(false)
})

test("logout revocation refuses signed-out sessions and leaves impersonation untouched", async () => {
  getSession.mockResolvedValue(null)
  await expect(revokePushBindingBeforeLogout(activeSubscription.endpoint)).rejects.toThrow("Unauthorized")
  getSession.mockResolvedValue({ user: { id: "user-1" }, session: { impersonatedBy: "admin-1" } })
  expect(await revokePushBindingBeforeLogout(activeSubscription.endpoint)).toBe(false)
  expect(unsubscribe).not.toHaveBeenCalled()
})

afterEach(() => jest.useRealTimers())

test("delivery processes the queue with at most five simultaneous sends", async () => {
  subscriptions = Array.from({ length: 7 }, (_, index) => ({ ...activeSubscription, id: `subscription-${index}` }))
  const releases: (() => void)[] = []
  let inFlight = 0
  let maximumInFlight = 0
  sendNotification.mockImplementation(async () => {
    inFlight += 1
    maximumInFlight = Math.max(maximumInFlight, inFlight)
    await new Promise<void>((resolve) => releases.push(resolve))
    inFlight -= 1
  })
  const result = delivery.sendToAll("Hello")
  await Bun.sleep(0)
  expect(sendNotification).toHaveBeenCalledTimes(5)
  for (const release of releases.splice(0)) release()
  await Bun.sleep(0)
  expect(sendNotification).toHaveBeenCalledTimes(7)
  for (const release of releases.splice(0)) release()
  expect(await result).toMatchObject({ accepted: 7, failed: 0 })
  expect(maximumInFlight).toBe(5)
})

test("a provider that never settles times out without losing successful deliveries", async () => {
  jest.useFakeTimers()
  subscriptions = [activeSubscription, { ...activeSubscription, id: "subscription-2" }]
  const started = Promise.withResolvers<void>()
  const destroy = spyOn(https.Agent.prototype, "destroy")
  try {
    sendNotification.mockImplementationOnce(() => {
      started.resolve()
      return new Promise<void>(() => undefined)
    })
    const result = delivery.sendToAll("Hello")
    await started.promise
    jest.advanceTimersByTime(10_000)
    expect(await result).toMatchObject({ success: true, accepted: 1, failed: 1, failureCategories: { timeout: 1 } })
    expect(destroy).toHaveBeenCalledTimes(2)
  } finally {
    destroy.mockRestore()
  }
})

test("a stalled bookkeeping write cannot turn provider acceptance into a delivery failure", async () => {
  jest.useFakeTimers()
  subscriptions = [activeSubscription]
  const started = Promise.withResolvers<void>()
  updateWhere.mockImplementationOnce(() => {
    started.resolve()
    return new Promise<undefined>(() => undefined)
  })
  const result = delivery.sendToAll("Hello")
  await started.promise
  jest.advanceTimersByTime(2_000)
  expect(await result).toMatchObject({ success: true, accepted: 1, failed: 0, failureCategories: { bookkeeping: 1 } })
  expect(sendNotification).toHaveBeenCalledTimes(1)
})

test("stored WNS subscriptions remain deliverable after endpoint validation", async () => {
  subscriptions = [{ ...activeSubscription, endpoint: "https://cloud.notify.windows.com/?token=existing-channel" }]
  expect(await delivery.sendToAll("Hello")).toMatchObject({ accepted: 1, failed: 0 })
  expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ status: "disabled" }))
})

test("unsafe stored endpoints are disabled without contacting a provider", async () => {
  subscriptions = [{ ...activeSubscription, endpoint: "https://127.0.0.1/private" }]
  expect(await delivery.sendToAll("Hello")).toMatchObject({
    accepted: 0,
    failed: 1,
    failureCategories: { invalidSubscription: 1 }
  })
  expect(sendNotification).not.toHaveBeenCalled()
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({ status: "disabled", disabledReason: "Stored push subscription failed validation" })
  )
})

test("invalid stored P-256 points are disabled without contacting a provider", async () => {
  subscriptions = [
    { ...activeSubscription, p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString("base64url") }
  ]
  expect(await delivery.sendToAll("Hello")).toMatchObject({
    accepted: 0,
    failed: 1,
    failureCategories: { invalidSubscription: 1 }
  })
  expect(sendNotification).not.toHaveBeenCalled()
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({ status: "disabled", disabledReason: "Stored push subscription failed validation" })
  )
})
