"use client"

import { LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ThemeButtons } from "@/core/theme/ThemeButtons"
import { toast } from "@/shared/ui/base/toast"
import { logout } from "./logout"
import { MorphMenu, reveal, spring } from "./MorphMenu"
import { ROUTES } from "./site"

type AccountUser = { name: string; image?: string | null }

const itemClass =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-none hover:bg-foreground/10 focus-visible:bg-foreground/10 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"

/** Morphs on its own between the button and the open panel. */
function UserAvatar({ user }: { user: AccountUser }) {
  return (
    <motion.span
      layoutId="account-avatar"
      transition={spring}
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground"
    >
      {user.image ? (
        // biome-ignore lint/performance/noImgElement: a freshly mounted Base UI Avatar shows its fallback for a frame, mid-morph.
        <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        <UserRoundIcon className="size-4" />
      )}
    </motion.span>
  )
}

/** Combines account navigation and sign-out. */
export function AccountMenu({ user }: { user: AccountUser }) {
  const t = useTranslations("Navigation")
  const [isPending, setIsPending] = useState(false)
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
    <MorphMenu
      layoutId="account-menu"
      buttonLabel={t("myAccount")}
      panelLabel={t("myAccount")}
      button={<UserAvatar user={user} />}
      buttonClassName="overflow-hidden"
      panelClassName="top-0 left-0 w-56 md:-top-2 md:-right-2 md:left-auto"
    >
      {(close) => (
        <>
          <div className="flex flex-col items-center gap-3 px-3 pt-3 pb-2">
            <UserAvatar user={user} />
            <motion.p {...reveal} className="max-w-full truncate text-sm font-medium">
              {user.name}
            </motion.p>
          </div>
          <motion.div {...reveal} className="flex flex-col gap-0.5">
            <Link href={ROUTES.account} className={itemClass} onClick={() => close()}>
              <UserRoundIcon />
              {t("myAccount")}
            </Link>
            <Link href={ROUTES.accountSettings} className={itemClass} onClick={() => close()}>
              <SettingsIcon />
              {t("routes.accountSettings")}
            </Link>
            <div className="flex justify-center py-1">
              <ThemeButtons />
            </div>
            <hr className="mx-3 my-1 border-foreground/5" />
            <button type="button" className={itemClass} disabled={isPending} onClick={handleLogout}>
              <LogOutIcon />
              {isPending ? t("loggingOut") : t("logout")}
            </button>
          </motion.div>
        </>
      )}
    </MorphMenu>
  )
}
