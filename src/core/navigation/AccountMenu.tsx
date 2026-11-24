"use client"

import { LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
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

type AccountUser = { name: string; image?: string | null }

// Morph from the 36px trigger circle (top-right of the popup) to the full panel; the
// open inset is negative so the popup's shadow isn't clipped. The near-1 opacity lets
// Base UI detect the exit animation and wait for it before hiding the popup.
const closedClip = "inset(0px 0px calc(100% - 36px) calc(100% - 36px) round 18px)"
const morph = {
  initial: { clipPath: closedClip, opacity: 0.9999 },
  animate: {
    clipPath: "inset(-32px -32px calc(0% - 32px) calc(0% - 32px) round 56px)",
    opacity: 1,
    transition: { type: "spring", bounce: 0.15, visualDuration: 0.25 }
  },
  // No bounce on close: overshoot would clip into the avatar before the trigger takes over.
  exit: { clipPath: closedClip, opacity: 0.9999, transition: { type: "spring", bounce: 0, visualDuration: 0.2 } }
} as const
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
const reveal = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)", transition: { delay: 0.15 } },
  exit: { opacity: 0, filter: "blur(8px)", transition: { duration: 0.1 } }
}

function UserAvatar({ user, className }: { user: AccountUser; className?: string }) {
  return (
    <Avatar aria-hidden="true" className={className}>
      {user.image ? <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback>
        <UserRoundIcon />
      </AvatarFallback>
    </Avatar>
  )
}

/** Combines account navigation and sign-out. */
export function AccountMenu({ user }: { user: AccountUser }) {
  const t = useTranslations("Navigation")
  const [isPending, setIsPending] = useState(false)
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  async function handleLogout() {
    setIsPending(true)
    try {
      const result = await logout()
      if (result.error) {
        toast.add({ type: "error", title: t("logoutFailed") })
        return
      }
      window.location.assign(ROUTES.login)
    } catch {
      toast.add({ type: "error", title: t("logoutFailed") })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full data-popup-open:opacity-0"
            aria-label={t("myAccount")}
          />
        }
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <AnimatePresence>
        {open ? (
          <DropdownMenuContent
            keepMounted
            align="end"
            sideOffset={-36}
            className="w-64"
            render={<motion.div {...(reduceMotion ? fade : morph)} />}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel
                className="-mt-1 h-8 truncate py-0 pr-10 text-sm leading-8 font-medium text-foreground"
                render={<motion.div {...reveal} />}
              >
                {user.name}
              </DropdownMenuLabel>
              {/* Pinned 2px in, exactly over the trigger's avatar (32px in a 36px button). */}
              <UserAvatar user={user} className="absolute top-0.5 right-0.5" />
              <motion.div {...reveal}>
                <DropdownMenuItem render={<Link href={ROUTES.account} />}>
                  <UserRoundIcon />
                  {t("myAccount")}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={ROUTES.accountSettings} />}>
                  <SettingsIcon />
                  {t("routes.accountSettings")}
                </DropdownMenuItem>
              </motion.div>
            </DropdownMenuGroup>
            <motion.div {...reveal}>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isPending} onClick={handleLogout} closeOnClick={false}>
                <LogOutIcon />
                {isPending ? t("loggingOut") : t("logout")}
              </DropdownMenuItem>
            </motion.div>
          </DropdownMenuContent>
        ) : null}
      </AnimatePresence>
    </DropdownMenu>
  )
}
