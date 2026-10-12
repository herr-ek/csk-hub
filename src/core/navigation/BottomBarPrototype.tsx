"use client"

// PROTOTYPE — Liquid Glass quick-access bar for mobile. Four variants, switchable via `?bar=A|B|C|D`, mounted in the
// real (app) layout so they are judged against real pages. Lives on the 64-bottom-bar-prototype branch only; never merge.

import { type LucideIcon, MenuIcon, MessageCircleIcon, NewspaperIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { PrototypeSwitcher } from "@/shared/ui/PrototypeSwitcher"
import { cn } from "@/shared/utils"
import { MobileNavigation } from "./MobileNavigation"
import type { NavLinkItem } from "./NavLinks"
import { isActiveRoute } from "./navigation-utils"
import { type MenuRouteId, ROUTES } from "./site"

const VARIANTS = [
  { key: "A", name: "Floating pill" },
  { key: "B", name: "Split pill" },
  { key: "C", name: "Docked bar" },
  { key: "D", name: "Minimizing pill" }
] as const

type Variant = (typeof VARIANTS)[number]["key"]

const isVariant = (value: string | null): value is Variant => VARIANTS.some((variant) => variant.key === value)

const SHOW_SWITCHER = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"

/** Stand-in for the user's saved quick-access shortcuts. */
const SHORTCUTS: { id: MenuRouteId; icon: LucideIcon }[] = [
  { id: "news", icon: NewspaperIcon },
  { id: "messages", icon: MessageCircleIcon }
]

/** The glass material: translucent tint, heavy blur and saturation, a light rim, top highlight and soft drop shadow. */
const glass =
  "relative border border-white/40 bg-background/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_8px_32px_rgb(0_0_0/0.18)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-background/30 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_32px_rgb(0_0_0/0.5)]"

/** A faint top-down sheen, as if light catches the upper edge of the glass. */
const sheen =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-linear-to-b before:from-white/35 before:to-transparent before:to-60% dark:before:from-white/8"

type BarProps = { items: NavLinkItem[]; isImpersonating: boolean }

export function BottomBarPrototype(props: BarProps) {
  return (
    <Suspense fallback={<FloatingPill {...props} pathname={null} />}>
      <SwitchableBar {...props} />
    </Suspense>
  )
}

function SwitchableBar(props: BarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const fromUrl = useSearchParams().get("bar")
  // Links drop the query param, but the layout persists, so the chosen variant survives navigation in state.
  const [variant, setVariant] = useState<Variant>(isVariant(fromUrl) ? fromUrl : "A")
  useEffect(() => {
    if (isVariant(fromUrl)) setVariant(fromUrl)
  }, [fromUrl])

  const Bar = { A: FloatingPill, B: SplitPill, C: DockedBar, D: MinimizingPill }[variant]
  return (
    <>
      <Bar {...props} pathname={pathname} />
      {SHOW_SWITCHER ? (
        <div className="md:hidden">
          <PrototypeSwitcher
            variants={VARIANTS}
            current={variant}
            onChange={(key) => {
              if (!isVariant(key)) return
              setVariant(key)
              router.replace(`${pathname}?bar=${key}`, { scroll: false })
            }}
          />
        </div>
      ) : null}
    </>
  )
}

type VariantProps = BarProps & { pathname: string | null }

function useShortcuts(pathname: string | null) {
  const t = useTranslations("Navigation")
  return SHORTCUTS.map(({ id, icon }) => ({
    id,
    icon,
    href: ROUTES[id],
    label: t(`routes.${id}`),
    active: pathname !== null && isActiveRoute(pathname, ROUTES[id])
  }))
}

/** Keeps page content clear of the fixed bar. */
function Spacer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-[calc(6rem+env(safe-area-inset-bottom))] shrink-0 md:hidden", className)}
    />
  )
}

const floatingFrame =
  "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden"

function slotClass(active: boolean, compact = false) {
  return cn(
    "relative flex flex-col items-center justify-center rounded-full font-medium text-foreground/70 transition-all duration-300",
    compact ? "size-11 gap-0" : "min-w-16 gap-0.5 px-4 py-1.5",
    active && "bg-foreground/10 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] dark:bg-white/15"
  )
}

function SlotLabel({ children, hidden = false }: { children: string; hidden?: boolean }) {
  return (
    <span
      className={cn(
        "overflow-hidden text-[11px] leading-tight transition-all duration-300",
        hidden ? "max-h-0 opacity-0" : "max-h-4 opacity-100"
      )}
    >
      {children}
    </span>
  )
}

function MenuSlot({
  items,
  isImpersonating,
  className,
  showLabel
}: BarProps & { className: string; showLabel: boolean }) {
  const t = useTranslations("Navigation")
  return (
    <MobileNavigation
      items={items}
      isImpersonating={isImpersonating}
      trigger={{
        render: <button type="button" aria-label={showLabel ? undefined : t("openMenu")} className={className} />,
        children: (
          <>
            <MenuIcon className="size-5" />
            <SlotLabel hidden={!showLabel}>{t("menu")}</SlotLabel>
          </>
        )
      }}
    />
  )
}

/** A — one centred capsule; the active slot sits on an inner lens chip. Menu is the last slot. */
function FloatingPill({ pathname, compact = false, ...props }: VariantProps & { compact?: boolean }) {
  const shortcuts = useShortcuts(pathname)
  const t = useTranslations("Navigation")
  return (
    <>
      <Spacer />
      <div className={floatingFrame}>
        <nav
          aria-label={t("primary")}
          className={cn(glass, sheen, "pointer-events-auto flex items-center gap-1 rounded-full p-1.5")}
        >
          {shortcuts.map((shortcut) => (
            <Link
              key={shortcut.id}
              href={shortcut.href}
              aria-current={shortcut.active ? "page" : undefined}
              aria-label={compact ? shortcut.label : undefined}
              className={slotClass(shortcut.active, compact)}
            >
              <shortcut.icon className="size-5" />
              <SlotLabel hidden={compact}>{shortcut.label}</SlotLabel>
            </Link>
          ))}
          <MenuSlot {...props} className={slotClass(false, compact)} showLabel={!compact} />
        </nav>
      </div>
    </>
  )
}

/** B — shortcuts in a capsule, with Menu as a separate round glass button beside it (iOS 26 tab bar + accessory). */
function SplitPill({ pathname, ...props }: VariantProps) {
  const shortcuts = useShortcuts(pathname)
  const t = useTranslations("Navigation")
  return (
    <>
      <Spacer />
      <div className={cn(floatingFrame, "items-end")}>
        <nav
          aria-label={t("primary")}
          className={cn(glass, sheen, "pointer-events-auto flex items-center gap-1 rounded-full p-1.5")}
        >
          {shortcuts.map((shortcut) => (
            <Link
              key={shortcut.id}
              href={shortcut.href}
              aria-current={shortcut.active ? "page" : undefined}
              className={slotClass(shortcut.active)}
            >
              <shortcut.icon className="size-5" />
              <SlotLabel>{shortcut.label}</SlotLabel>
            </Link>
          ))}
        </nav>
        <div className="pointer-events-auto">
          <MenuSlot
            {...props}
            showLabel={false}
            className={cn(glass, sheen, "flex size-[3.75rem] items-center justify-center rounded-full text-foreground")}
          />
        </div>
      </div>
    </>
  )
}

/** C — classic edge-to-edge tab bar in glass, docked to the bottom with a hairline on top. */
function DockedBar({ pathname, ...props }: VariantProps) {
  const shortcuts = useShortcuts(pathname)
  const t = useTranslations("Navigation")
  const cell = (active: boolean) =>
    cn(
      "flex flex-col items-center gap-0.5 py-1.5 font-medium text-foreground/60 transition-colors",
      active && "text-primary"
    )
  return (
    <>
      <Spacer className="h-[calc(4rem+env(safe-area-inset-bottom))]" />
      <nav
        aria-label={t("primary")}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-black/10 bg-background/55 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden dark:border-white/10 dark:bg-background/40"
      >
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.id}
            href={shortcut.href}
            aria-current={shortcut.active ? "page" : undefined}
            className={cell(shortcut.active)}
          >
            <shortcut.icon className="size-6" />
            <SlotLabel>{shortcut.label}</SlotLabel>
          </Link>
        ))}
        <MenuSlot {...props} showLabel className={cell(false)} />
      </nav>
    </>
  )
}

/** D — variant A that collapses to an icon-only pill while scrolling down and expands again on the way up. */
function MinimizingPill(props: VariantProps) {
  const [compact, setCompact] = useState(false)
  const lastY = useRef(0)
  useEffect(() => {
    // Capture scrolls from inner panes too, not only the window.
    const onScroll = (event: Event) => {
      const y = event.target instanceof Element ? event.target.scrollTop : window.scrollY
      setCompact(y > 48 && y > lastY.current)
      lastY.current = y
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])
  return <FloatingPill {...props} compact={compact} />
}
