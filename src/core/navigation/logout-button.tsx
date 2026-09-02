"use client"

import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { Button } from "@/shared/ui/base/button"
import { ROUTES } from "./site"

export function LogoutButton({ isImpersonating = false }: { isImpersonating?: boolean }) {
  const [isPending, setIsPending] = useState(false)

  async function handleLogout() {
    setIsPending(true)
    try {
      const result = isImpersonating ? await authClient.admin.stopImpersonating() : await authClient.signOut()
      if (!result.error) window.location.assign(isImpersonating ? ROUTES.adminMembers : ROUTES.login)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button disabled={isPending} onClick={handleLogout} size="sm" type="button" variant="ghost">
      <LogOutIcon data-icon="inline-start" />
      {isPending
        ? isImpersonating
          ? "Stopping impersonation…"
          : "Logging out…"
        : isImpersonating
          ? "Stop impersonating"
          : "Logout"}
    </Button>
  )
}
