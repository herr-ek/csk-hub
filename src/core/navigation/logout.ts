import { authClient } from "@/core/auth/auth-client"
import { revokePushBindingBeforeLogout } from "./logout-actions"

const PUSH_CLEANUP_DEADLINE_MS = 2_000

async function cleanUpPushSubscription(signal: AbortSignal) {
  if (!("serviceWorker" in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration("/")
    if (signal.aborted) return
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription || signal.aborted) return

    let removeFromBrowser: boolean
    try {
      removeFromBrowser = await revokePushBindingBeforeLogout(subscription.endpoint)
    } catch {
      // If server cleanup fails, browser removal can still stop notifications after logout.
      removeFromBrowser = true
    }
    if (removeFromBrowser && !signal.aborted) await subscription.unsubscribe().catch(() => false)
  } catch {
    // Browser discovery and push cleanup must never prevent signing out.
  }
}

/**
 * Signs out after at most two seconds of best-effort push cleanup. Stopping
 * impersonation leaves the Admin's browser subscription untouched. Auth errors
 * are returned to the caller; auth transport failures reject, while push cleanup
 * failures never block logout.
 */
export async function logout(isImpersonating: boolean) {
  if (isImpersonating) return authClient.admin.stopImpersonating()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      cleanUpPushSubscription(controller.signal),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          controller.abort()
          resolve()
        }, PUSH_CLEANUP_DEADLINE_MS)
      })
    ])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  return authClient.signOut()
}
