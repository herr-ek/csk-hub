import { afterAll, beforeEach, expect, mock, test } from "bun:test"

const signOut = mock(async () => ({ error: null }))
const stopImpersonating = mock(async () => ({ error: null }))
const revoke = mock(async () => true)
const unsubscribe = mock(async () => true)
const getSubscription = mock(async () => ({ endpoint: "https://fcm.googleapis.com/send/test", unsubscribe }))
const getRegistration = mock(async () => ({ pushManager: { getSubscription } }))
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")

mock.module("@/core/auth/auth-client", () => ({ authClient: { signOut, admin: { stopImpersonating } } }))
mock.module("./logout-actions", () => ({ revokePushBindingBeforeLogout: revoke }))
const { logout } = await import("./logout")

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: { getRegistration } } })
  signOut.mockReset().mockResolvedValue({ error: null })
  stopImpersonating.mockReset().mockResolvedValue({ error: null })
  revoke.mockReset().mockResolvedValue(true)
  unsubscribe.mockReset().mockResolvedValue(true)
  getSubscription.mockReset().mockResolvedValue({ endpoint: "https://fcm.googleapis.com/send/test", unsubscribe })
  getRegistration.mockReset().mockResolvedValue({ pushManager: { getSubscription } })
})

afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator)
  else Reflect.deleteProperty(globalThis, "navigator")
})

test("revokes the owned binding and removes browser push before signing out", async () => {
  await logout(false)
  expect(revoke).toHaveBeenCalledWith("https://fcm.googleapis.com/send/test")
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])
})

test("failed server revocation still removes browser push and signs out", async () => {
  revoke.mockRejectedValue(new Error("Network unavailable"))
  await expect(logout(false)).resolves.toMatchObject({ error: null })
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(signOut).toHaveBeenCalledTimes(1)
})

for (const [name, operation] of [
  ["registration lookup", getRegistration],
  ["subscription lookup", getSubscription],
  ["browser unsubscribe", unsubscribe]
] as const) {
  test(`failed ${name} never prevents sign-out`, async () => {
    operation.mockRejectedValue(new Error("Browser failure"))
    await expect(logout(false)).resolves.toMatchObject({ error: null })
    expect(signOut).toHaveBeenCalledTimes(1)
  })
}

test("a binding owned by another User is left untouched", async () => {
  revoke.mockResolvedValue(false)
  await logout(false)
  expect(unsubscribe).not.toHaveBeenCalled()
  expect(signOut).toHaveBeenCalledTimes(1)
})

test("stopping impersonation never touches browser push or signs out the Admin", async () => {
  await logout(true)
  expect(stopImpersonating).toHaveBeenCalledTimes(1)
  expect(getRegistration).not.toHaveBeenCalled()
  expect(revoke).not.toHaveBeenCalled()
  expect(signOut).not.toHaveBeenCalled()
})

test("logout works without service-worker support", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} })
  await logout(false)
  expect(signOut).toHaveBeenCalledTimes(1)
})

test("auth transport errors still reach the caller", async () => {
  signOut.mockRejectedValue(new Error("Auth unavailable"))
  await expect(logout(false)).rejects.toThrow("Auth unavailable")
})
