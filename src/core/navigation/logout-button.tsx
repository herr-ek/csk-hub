"use client"

import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { revokePushBindingBeforeLogout } from "./logout-actions"
import { ROUTES } from "./site"

export function LogoutButton({ isImpersonating = false }: { isImpersonating?: boolean }) {
  const t = useTranslations("Navigation")
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(false)

  async function handleLogout() {
    setIsPending(true)
    setError(false)
    try {
      if (!isImpersonating && "serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration("/")
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          const removedBinding = await revokePushBindingBeforeLogout(subscription.endpoint)
          if (removedBinding) await subscription.unsubscribe().catch(() => false)
        }
      }
      const result = isImpersonating ? await authClient.admin.stopImpersonating() : await authClient.signOut()
      if (!result.error) {
        window.location.assign(isImpersonating ? ROUTES.adminUsers : ROUTES.login)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      <Button disabled={isPending} onClick={handleLogout} size="sm" type="button" variant="ghost">
        <LogOutIcon data-icon="inline-start" />
        {isPending
          ? isImpersonating
            ? t("stoppingImpersonation")
            : t("loggingOut")
          : isImpersonating
            ? t("stopImpersonating")
            : t("logout")}
      </Button>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t("logoutFailed")}
        </p>
      ) : null}
    </div>
  )
}
