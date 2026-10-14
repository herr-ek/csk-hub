import Link from "next/link"
import { Suspense } from "react"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { getRequestSession } from "@/core/auth/session.server"
import { app } from "@/core/config/app"
import { getTranslations } from "@/core/i18n/server"
import { useTranslations } from "@/core/i18n/translations"
import { type NavigationRouteId, ROUTES } from "@/core/navigation/site"
import { getUserPreferences } from "@/core/preferences"
import { cn } from "@/shared/utils"
import { ThemeSwitch } from "../theme/ThemeSwitch"
import { LogoutButton } from "./logout-button"
import { MobileNavigation } from "./MobileNavigation"
import { NavLinks } from "./NavLinks"
import { QuickAccessBar } from "./QuickAccessBar"
import { visibleQuickAccess } from "./quick-access"

export type NavigationRoute = {
  id: NavigationRouteId
  section: "member" | "admin"
  label: string
}

export function getNavigationItems(
  config: NavigationConfig | null,
  t: (key: "admin" | "messages" | "myAccount" | "login" | "news") => string
): NavigationRoute[] {
  const authenticatedRoutes = [
    { id: "news" as const, section: "member" as const, label: t("news") },
    { id: "messages" as const, section: "member" as const, label: t("messages") },
    { id: "admin" as const, section: "admin" as const, label: t("admin") },
    { id: "account" as const, section: "member" as const, label: t("myAccount") }
  ]
  const loginRoute = { id: "login" as const, section: "member" as const, label: t("login") }

  const routes = config
    ? authenticatedRoutes.filter((route) => route.section !== "admin" || config.showAdmin)
    : [loginRoute]
  return routes
}

export type NavigationConfig = {
  showAdmin: boolean
  impersonatingUserName?: string
}

export interface AppNavigationTemplateProps {
  config: NavigationConfig | null
}
export function AppNavigationTemplate({ config }: AppNavigationTemplateProps) {
  const t = useTranslations("Navigation")
  const items = getNavigationItems(config, t).map((item) => ({ id: item.id, href: ROUTES[item.id], label: item.label }))
  const isImpersonating = Boolean(config?.impersonatingUserName)

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href={ROUTES.home} className="font-semibold text-base tracking-normal">
            {app.name}
          </Link>
          {/* Signed out there is only the login link, which fits on every screen. */}
          <nav aria-label={t("primary")} className={cn("items-center gap-1.5", config ? "hidden md:flex" : "flex")}>
            <NavLinks items={items} />
            {config ? <LogoutButton isImpersonating={isImpersonating} /> : null}
            <ThemeSwitch />
          </nav>
          {config ? (
            <div className="md:hidden">
              <MobileNavigation items={items} isImpersonating={isImpersonating} />
            </div>
          ) : null}
        </div>
        {config?.impersonatingUserName ? (
          <div className="rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground" role="status">
            {t("impersonating", { name: config.impersonatingUserName })}
          </div>
        ) : null}
      </div>
    </header>
  )
}

export function AppNavigation() {
  return (
    <Suspense fallback={<AppNavigationTemplate config={null} />}>
      <RuntimeAppNavigation />
    </Suspense>
  )
}

export async function RuntimeAppNavigation() {
  const session = await getRequestSession()
  const isAdmin = await isUserAdmin(session)
  return (
    <AppNavigationTemplate
      config={{
        showAdmin: isAdmin,
        ...(session?.session.impersonatedBy ? { impersonatingUserName: session.user.name } : {})
      }}
    />
  )
}

/** The member's quick-access bar for small screens. Render it after the page content so its spacer comes last. */
export function AppQuickAccessBar() {
  return (
    <Suspense fallback={null}>
      <RuntimeQuickAccessBar />
    </Suspense>
  )
}

async function RuntimeQuickAccessBar() {
  const session = await getRequestSession()
  if (!session) return null

  const [isAdmin, preferences, t] = await Promise.all([
    isUserAdmin(session),
    getUserPreferences(session.user.id),
    getTranslations("Navigation")
  ])
  if (!preferences.quickAccessEnabled) return null

  const shortcuts = visibleQuickAccess(preferences.quickAccess, { isAdmin }).map((id) => ({
    id,
    href: ROUTES[id],
    label: t(`routes.${id}`)
  }))
  const items = getNavigationItems({ showAdmin: isAdmin }, t).map((item) => ({
    id: item.id,
    href: ROUTES[item.id],
    label: item.label
  }))

  return (
    <QuickAccessBar shortcuts={shortcuts} items={items} isImpersonating={Boolean(session.session.impersonatedBy)} />
  )
}
