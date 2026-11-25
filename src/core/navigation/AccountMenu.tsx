"use client"

import { LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import Link from "next/link"
import { type FocusEvent, type KeyboardEvent, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ThemeButtons } from "@/core/theme/ThemeButtons"
import { toast } from "@/shared/ui/base/toast"
import { logout } from "./logout"
import { ROUTES } from "./site"

type AccountUser = { name: string; image?: string | null }

// Adapted from motion.dev's Clerk user button: the button and the open panel share a
// layoutId so Motion morphs one into the other, and the avatar morphs on its own.
const spring = { type: "spring", bounce: 0.15, visualDuration: 0.25 } as const
const reveal = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)", transition: { delay: 0.15 } },
  exit: { opacity: 0, filter: "blur(8px)" }
}
const itemClass =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-none hover:bg-foreground/10 focus-visible:bg-foreground/10 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"

// Module-level so React calls it once per mount, not on every render.
function focusOnMount(element: HTMLElement | null) {
  element?.focus({ preventScroll: true })
}

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
  const [open, setOpen] = useState(false)
  // Only Escape hands focus back to the button; other closes leave focus where the user put it.
  const [refocusButton, setRefocusButton] = useState(false)

  function close(focusButton = false) {
    setRefocusButton(focusButton)
    setOpen(false)
  }

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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") close(true)
  }

  // Covers clicking outside and tabbing away. The panel is focusable, so clicks inside it keep focus within.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative size-9">
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              role="dialog"
              aria-label={t("myAccount")}
              layoutId="account-menu"
              transition={spring}
              style={{ borderRadius: 24 }}
              ref={focusOnMount}
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="absolute top-0 left-0 z-50 w-56 overflow-hidden bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none md:-top-2 md:-right-2 md:left-auto dark:ring-foreground/10"
            >
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
                {/* On small screens the menu sheet has the theme. */}
                <div className="hidden justify-center py-1 md:flex">
                  <ThemeButtons />
                </div>
                <hr className="mx-3 my-1 border-foreground/5" />
                <button type="button" className={itemClass} disabled={isPending} onClick={handleLogout}>
                  <LogOutIcon />
                  {isPending ? t("loggingOut") : t("logout")}
                </button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              type="button"
              layoutId="account-menu"
              transition={spring}
              style={{ borderRadius: 999 }}
              ref={refocusButton ? focusOnMount : undefined}
              aria-label={t("myAccount")}
              aria-expanded={false}
              onClick={() => setOpen(true)}
              // Not buttonVariants: its transition-all, active translate and border fight Motion's per-frame transforms.
              className="absolute inset-0 cursor-pointer overflow-hidden outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <UserAvatar user={user} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
