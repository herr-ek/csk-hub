"use client"

import { LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/base/avatar"
import { Button } from "@/shared/ui/base/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/shared/ui/base/dropdown-menu"
import { toast } from "@/shared/ui/base/toast"
import { logout } from "./logout"
import { ROUTES } from "./site"

/** Combines account navigation and sign-out; impersonated sessions return to the Admin's session instead. */
export function AccountMenu({
  user,
  isImpersonating = false
}: {
  user: { name: string; image?: string | null }
  isImpersonating?: boolean
}) {
  const t = useTranslations("Navigation")
  const [isPending, setIsPending] = useState(false)

  async function handleLogout() {
    setIsPending(true)
    try {
      const result = await logout(isImpersonating)
      if (result.error) {
        toast.add({ type: "error", title: isImpersonating ? t("stopImpersonationFailed") : t("logoutFailed") })
        return
      }
      window.location.assign(isImpersonating ? ROUTES.adminUsers : ROUTES.login)
    } catch {
      toast.add({ type: "error", title: isImpersonating ? t("stopImpersonationFailed") : t("logoutFailed") })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={t("myAccount")} />}
      >
        <Avatar aria-hidden="true">
          {user.image ? <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback>
            <UserRoundIcon />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="max-w-64 truncate">{user.name}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href={ROUTES.account} />}>
            <UserRoundIcon />
            {t("myAccount")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={ROUTES.accountSettings} />}>
            <SettingsIcon />
            {t("routes.accountSettings")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onClick={handleLogout} closeOnClick={false}>
          <LogOutIcon />
          {isPending
            ? isImpersonating
              ? t("stoppingImpersonation")
              : t("loggingOut")
            : isImpersonating
              ? t("stopImpersonating")
              : t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
