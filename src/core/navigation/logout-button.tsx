"use client"

import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { ROUTES } from "./site"

export function LogoutButton({ isImpersonating = false }: { isImpersonating?: boolean }) {
  const t = useTranslations("Navigation")
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string>()

  async function handleLogout() {
    setError(undefined)
    setIsPending(true)
    try {
      const result = isImpersonating ? await authClient.admin.stopImpersonating() : await authClient.signOut()
      if (result.error) {
        setError(isImpersonating ? t("stopImpersonationFailed") : t("logoutFailed"))
        return
      }
      window.location.assign(isImpersonating ? ROUTES.adminUsers : ROUTES.login)
    } catch {
      setError(isImpersonating ? t("stopImpersonationFailed") : t("logoutFailed"))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
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
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
