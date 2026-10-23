import Link from "next/link"
import { Suspense } from "react"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { getRequestSession } from "@/core/auth/session.server"
import { app } from "@/core/config/app"
import { useTranslations } from "@/core/i18n/translations"
import { type NavigationRouteId, ROUTES } from "@/core/navigation/site"
import { cn } from "@/shared/utils"
import { ThemeSwitch } from "../theme/ThemeSwitch"
import { AccountMenu } from "./AccountMenu"
import { MobileNavigation } from "./MobileNavigation"
import { NavLinks } from "./NavLinks"

export type NavigationRoute = {
  id: NavigationRouteId
  section: "member" | "admin"
  label: string
}

export function getNavigationItems(
  config: NavigationConfig | null,
  t: (key: "admin" | "messages" | "members" | "myAccount" | "login" | "news") => string
): NavigationRoute[] {
  const authenticatedRoutes = [
    { id: "news" as const, section: "member" as const, label: t("news") },
    { id: "messages" as const, section: "member" as const, label: t("messages") },
    { id: "members" as const, section: "member" as const, label: t("members") },
    { id: "admin" as const, section: "admin" as const, label: t("admin") }
  ]
  const loginRoute = { id: "login" as const, section: "member" as const, label: t("login") }

  const routes = config
    ? authenticatedRoutes.filter((route) => route.section !== "admin" || config.showAdmin)
    : [loginRoute]
  return routes
}

export type NavigationConfig = {
  showAdmin: boolean
  user: { name: string; image?: string | null }
  impersonatingUserName?: string
}

/**
 * Something to show beside a navigation link, such as a feature's unread count. Supplied by
 * the app layout, since the navigation itself must not depend on features.
 */
export type NavigationBadges = Partial<Record<NavigationRouteId, React.ReactNode>>

export interface AppNavigationTemplateProps {
  config: NavigationConfig | null
  badges?: NavigationBadges
}
export function AppNavigationTemplate({ config, badges }: AppNavigationTemplateProps) {
  const t = useTranslations("Navigation")
  const items = getNavigationItems(config, t).map((item) => ({
    id: item.id,
    href: ROUTES[item.id],
    label: item.label,
    badge: badges?.[item.id]
  }))
  const isImpersonating = Boolean(config?.impersonatingUserName)

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href={ROUTES.home} className="font-semibold text-base tracking-normal">
            {app.name}
          </Link>
          <div className="flex items-center gap-2">
            {/* Signed out there is only the login link, which fits on every screen. */}
            <nav aria-label={t("primary")} className={cn("items-center gap-1.5", config ? "hidden md:flex" : "flex")}>
              <NavLinks items={items} />
              <ThemeSwitch />
            </nav>
            {config ? (
              <div className="md:hidden">
                <MobileNavigation items={items} />
              </div>
            ) : null}
            {config ? <AccountMenu user={config.user} isImpersonating={isImpersonating} /> : null}
          </div>
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

export function AppNavigation({ badges }: { badges?: NavigationBadges }) {
  return (
    <Suspense fallback={<AppNavigationTemplate config={null} />}>
      <RuntimeAppNavigation badges={badges} />
    </Suspense>
  )
}

export async function RuntimeAppNavigation({ badges }: { badges?: NavigationBadges }) {
  const session = await getRequestSession()
  const isAdmin = await isUserAdmin(session)
  return (
    <AppNavigationTemplate
      badges={badges}
      config={
        session
          ? {
              showAdmin: isAdmin,
              user: { name: session.user.name, image: session.user.image },
              ...(session?.session.impersonatedBy ? { impersonatingUserName: session.user.name } : {})
            }
          : null
      }
    />
  )
}
