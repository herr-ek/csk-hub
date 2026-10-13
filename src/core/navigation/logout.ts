import { authClient } from "@/core/auth/auth-client"
import { revokePushBindingBeforeLogout } from "./logout-actions"

async function cleanUpPushSubscription() {
  if (!("serviceWorker" in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration("/")
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    let removeFromBrowser: boolean
    try {
      removeFromBrowser = await revokePushBindingBeforeLogout(subscription.endpoint)
    } catch {
      // If server cleanup fails, browser removal can still stop notifications after logout.
      removeFromBrowser = true
    }
    if (removeFromBrowser) await subscription.unsubscribe().catch(() => false)
  } catch {
    // Browser discovery and push cleanup must never prevent signing out.
  }
}

/**
 * Signs out after best-effort push cleanup. Stopping impersonation leaves the
 * Admin's browser subscription untouched. Auth errors are returned to the caller;
 * auth transport failures reject, while push cleanup failures never block logout.
 */
export async function logout(isImpersonating: boolean) {
  if (isImpersonating) return authClient.admin.stopImpersonating()
  await cleanUpPushSubscription()
  return authClient.signOut()
}
