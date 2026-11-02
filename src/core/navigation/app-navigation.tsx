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
import { QuickAccessBar } from "./QuickAccessBar"
import { RefreshOnReturn } from "./RefreshOnReturn"
import { UnreadBadge, UnreadIndicator } from "./UnreadBadge"
import type { UnreadSources } from "./unread-sources"

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

export interface AppNavigationTemplateProps {
  config: NavigationConfig | null
  unreadSources?: UnreadSources
}
export function AppNavigationTemplate({ config, unreadSources = {} }: AppNavigationTemplateProps) {
  const t = useTranslations("Navigation")
  const items = getNavigationItems(config, t).map((item) => ({
    id: item.id,
    href: ROUTES[item.id],
    label: item.label,
    // Only render unread badge when not in suspense fallback.
    badge: config ? <UnreadBadge count={unreadSources[item.id]} /> : undefined
  }))
  const isImpersonating = Boolean(config?.impersonatingUserName)

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/*
          On small screens the title is centred, with the avatar to its left and the menu to its right. From `md` up the
          title leads and the links and avatar follow at the far end.
        */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:flex md:gap-2">
          <Link
            href={ROUTES.home}
            className="col-start-2 row-start-1 font-semibold text-base tracking-normal md:mr-auto"
          >
            {app.name}
          </Link>
          <div className="col-start-3 row-start-1 flex items-center justify-end gap-2">
            {/* Signed out there is only the login link, which fits on every screen. */}
            <nav aria-label={t("primary")} className={cn("items-center gap-1.5", config ? "hidden md:flex" : "flex")}>
              <NavLinks items={items} />
              <ThemeSwitch />
            </nav>
            {config ? (
              <div className="md:hidden">
                <MobileNavigation items={items} indicator={<UnreadIndicator counts={Object.values(unreadSources)} />} />
              </div>
            ) : null}
            {config ? <RefreshOnReturn /> : null}
          </div>
          {config ? (
            <div className="col-start-1 row-start-1 flex">
              <AccountMenu user={config.user} isImpersonating={isImpersonating} />
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

export interface AppNavigationProps {
  /** The unread counts the app layout composes from its features, shown beside their links. */
  unreadSources: UnreadSources
}

export function AppNavigation({ unreadSources }: AppNavigationProps) {
  return (
    <Suspense fallback={<AppNavigationTemplate config={null} />}>
      <RuntimeAppNavigation unreadSources={unreadSources} />
    </Suspense>
  )
}

export async function RuntimeAppNavigation({ unreadSources }: AppNavigationProps) {
  const session = await getRequestSession()
  const isAdmin = await isUserAdmin(session)
  return (
    <AppNavigationTemplate
      unreadSources={unreadSources}
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

/** The quick-access bar for signed-in members on small screens. Render it after the page content, spacer last. */
export function AppQuickAccessBar() {
  return (
    <Suspense fallback={null}>
      <RuntimeQuickAccessBar />
    </Suspense>
  )
}

async function RuntimeQuickAccessBar() {
  const session = await getRequestSession()
  return session ? <QuickAccessBar /> : null
}
