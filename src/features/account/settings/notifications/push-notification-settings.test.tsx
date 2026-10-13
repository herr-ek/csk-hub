import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { registerDom } from "@test/dom"

registerDom()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const getBinding = mock(async (): Promise<"bound" | "unbound" | "unsupported"> => "unbound")
const unsubscribe = mock(async () => true)
const subscription = { endpoint: "https://unsupported.example/channel", unsubscribe }
const getSubscription = mock(async () => subscription)
const registration = { pushManager: { getSubscription } }
const register = mock(async () => registration)
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker")
const originalPushManager = Object.getOwnPropertyDescriptor(window, "PushManager")
const originalNotification = Object.getOwnPropertyDescriptor(window, "Notification")

const translate = (key: string) => key
mock.module("@/core/i18n/translations", () => ({ useTranslations: () => translate }))
mock.module("./push-notification-actions", () => ({
  getPushSubscriptionBinding: getBinding,
  subscribeUserToPush: mock(),
  unsubscribeUserFromPush: mock(),
  sendPushNotificationTest: mock()
}))
const { PushNotificationSettings } = await import("./push-notification-settings")
let root: Root
let container: HTMLDivElement

beforeEach(() => {
  getBinding.mockReset().mockResolvedValue("unbound")
  unsubscribe.mockReset().mockResolvedValue(true)
  register.mockReset().mockResolvedValue(registration)
  getSubscription.mockReset().mockResolvedValue(subscription)
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } })
  Object.defineProperty(window, "PushManager", { configurable: true, value: class {} })
  Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted" } })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  for (const [target, name, descriptor] of [
    [navigator, "serviceWorker", originalServiceWorker],
    [window, "PushManager", originalPushManager],
    [window, "Notification", originalNotification]
  ] as const) {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else Reflect.deleteProperty(target, name)
  }
})

async function renderSettings() {
  await act(async () => root.render(<PushNotificationSettings />))
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label)
  expect(button).toBeDefined()
  await act(async () => button?.click())
}

test("unsupported endpoints offer browser removal without reconnect", async () => {
  getBinding.mockResolvedValue("unsupported")
  await renderSettings()
  expect(container.textContent).toContain("unsupportedSubscription")
  expect(container.textContent).not.toContain("reconnect")
  await clickButton("removeFromBrowser")
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain("disabled")
})

test("a failed lookup stays unknown and offers retry and explicit browser removal", async () => {
  getBinding.mockRejectedValue(new Error("Network unavailable"))
  await renderSettings()
  expect(container.textContent).toContain("bindingUnknown")
  expect(container.textContent).not.toContain("unbound")
  getBinding.mockResolvedValue("bound")
  await clickButton("retry")
  expect(container.textContent).toContain("enabled")
  expect(container.textContent).not.toContain("deviceEnableFailed")
})

test("browser removal remains available when binding lookup is unavailable", async () => {
  getBinding.mockRejectedValue(new Error("Network unavailable"))
  await renderSettings()
  await clickButton("removeFromBrowser")
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain("disabled")
})

test("an unbound subscription offers reconnect but never reports enabled", async () => {
  await renderSettings()
  expect(container.textContent).toContain("reconnect")
  expect(container.textContent).not.toContain("enabled")
})
