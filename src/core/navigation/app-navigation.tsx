import { headers } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { auth } from "@/core/auth/auth"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { app } from "@/core/config/app"
import { useTranslations } from "@/core/i18n/translations"
import { type NavigationRouteId, ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"
import { cn } from "@/shared/utils"
import { LogoutButton } from "./logout-button"

export type NavigationRoute = {
  id: NavigationRouteId
  section: "member" | "admin"
  label: string
}

export function getNavigationItems(
  config: NavigationConfig | null,
  t: (key: "admin" | "myAccount" | "login") => string
): NavigationRoute[] {
  const authenticatedRoutes = [
    { id: "admin" as const, section: "admin" as const, label: t("admin") },
    { id: "me" as const, section: "member" as const, label: t("myAccount") }
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
  const items = getNavigationItems(config, t)

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={ROUTES.home} className="font-semibold text-base tracking-normal">
            {app.name}
          </Link>
          <nav aria-label={t("primary")} className="flex flex-wrap items-center gap-1.5">
            {items.map((item) => (
              <Link
                key={item.id}
                href={ROUTES[item.id]}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-w-full")}
              >
                {item.label}
              </Link>
            ))}
            {config ? <LogoutButton isImpersonating={Boolean(config.impersonatingUserName)} /> : null}
          </nav>
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
  await connection()
  const session = await auth.api.getSession({ headers: await headers() })
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
