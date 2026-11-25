import { Suspense } from "react"
import { getRequestSession } from "@/core/auth/session.server"
import { can } from "@/core/authz"
import { useTranslations } from "@/core/i18n/translations"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { ThemeSwitch } from "../theme/ThemeSwitch"
import { AccountMenu } from "./AccountMenu"
import { CollapsingHeader } from "./CollapsingHeader"
import { DESTINATIONS, type DestinationId, MENUS, visibleDestinations } from "./destinations"
import { MobileNavigation } from "./MobileNavigation"
import { NavigationFrame } from "./NavigationFrame"
import { type NavLinkItem, NavLinks } from "./NavLinks"
import { QuickAccessBar } from "./QuickAccessBar"
import { RefreshOnReturn } from "./RefreshOnReturn"
import type { NavigationRouteId } from "./site"
import { TopNavigation } from "./TopNavigation"
import { UnreadBadge, UnreadIndicator } from "./UnreadBadge"
import type { UnreadSources } from "./unread-sources"

export type NavigationConfig = {
  showAdmin: boolean
  user: { name: string; image?: string | null }
}

export interface AppNavigationTemplateProps {
  config: NavigationConfig | null
  unreadSources?: UnreadSources
}

/** The avatar's place in the header, in a ring of glass from `md` up. */
const avatarClass =
  "pointer-events-auto relative col-start-1 row-start-1 justify-self-start md:glass md:col-start-3 md:justify-self-end md:rounded-full md:bg-neutral-200/40 md:p-1.75"

export function AppNavigationTemplate({ config, unreadSources = {} }: AppNavigationTemplateProps) {
  const t = useTranslations("Navigation")
  const itemsOf = (menu: readonly (DestinationId & NavigationRouteId)[]): NavLinkItem[] =>
    visibleDestinations(menu, config).map((id) => ({
      id,
      href: DESTINATIONS[id].href,
      label: t(DESTINATIONS[id].label),
      badge: config ? <UnreadBadge count={unreadSources[id]} /> : undefined
    }))

  if (!config) {
    return (
      <NavigationFrame>
        <nav
          aria-label={t("primary")}
          className="pointer-events-auto col-start-3 row-start-1 flex items-center gap-1.5 justify-self-end"
        >
          <NavLinks items={itemsOf(MENUS.topBar)} />
          <ThemeSwitch />
        </nav>
      </NavigationFrame>
    )
  }

  return (
    <CollapsingHeader>
      <TopNavigation items={itemsOf(MENUS.topBar)} />
      <div className="col-start-3 row-start-1 justify-self-end md:hidden">
        <MobileNavigation
          items={itemsOf(MENUS.sheet)}
          indicator={<UnreadIndicator counts={Object.values(unreadSources)} />}
        />
      </div>
      <RefreshOnReturn />
      {/* One menu for every screen size: a second would share its Motion layoutIds and break the morph. */}
      <div className={avatarClass}>
        <AccountMenu user={config.user} />
      </div>
    </CollapsingHeader>
  )
}

/** The header before it is known who is looking: the shapes of what a signed-in User sees. */
function NavigationPlaceholder() {
  return (
    <NavigationFrame aria-busy>
      <Skeleton className="col-start-2 row-start-1 hidden h-5 w-80 md:block lg:w-120" />
      <div className={avatarClass}>
        <Skeleton className="size-9 rounded-full" />
      </div>
    </NavigationFrame>
  )
}

export interface AppNavigationProps {
  /** The unread counts the app layout composes from its features, shown beside their links. */
  unreadSources: UnreadSources
}

export function AppNavigation({ unreadSources }: AppNavigationProps) {
  return (
    <Suspense fallback={<NavigationPlaceholder />}>
      <RuntimeAppNavigation unreadSources={unreadSources} />
    </Suspense>
  )
}

export async function RuntimeAppNavigation({ unreadSources }: AppNavigationProps) {
  const session = await getRequestSession()
  const active = session && (await can({ action: "app.access" }))
  const isAdmin = active && (await can({ action: "admin.access" }))
  return (
    <AppNavigationTemplate
      unreadSources={unreadSources}
      config={
        active && session
          ? {
              showAdmin: Boolean(isAdmin),
              user: { name: session.user.name, image: session.user.image }
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
