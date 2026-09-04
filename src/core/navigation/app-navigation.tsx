import { headers } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { auth } from "@/core/auth/auth"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { type NavigationRouteId, ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"
import { cn } from "@/shared/utils"
import { LogoutButton } from "./logout-button"

export type NavigationRoute = {
  id: NavigationRouteId
  section: "member" | "admin"
  label: string
}

const AUTHENTICATED_NAVIGATION_ROUTES = [
  { id: "news", section: "member", label: "News" },
  { id: "admin", section: "admin", label: "Admin" },
  { id: "me", section: "member", label: "My account" }
] as const satisfies readonly NavigationRoute[]

const LOGIN_NAVIGATION_ROUTE = {
  id: "login",
  section: "member",
  label: "Login"
} as const satisfies NavigationRoute

export function getNavigationItems(config: NavigationConfig | null): NavigationRoute[] {
  const routes = config
    ? AUTHENTICATED_NAVIGATION_ROUTES.filter((route) => route.section !== "admin" || config.showAdmin)
    : [LOGIN_NAVIGATION_ROUTE]
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
  const items = getNavigationItems(config)

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={ROUTES.home} className="font-semibold text-base tracking-normal">
            CSK Hub
          </Link>
          <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1.5">
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
            Impersonating {config.impersonatingUserName}
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
