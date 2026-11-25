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

export function AppNavigationTemplate({ config, unreadSources = {} }: AppNavigationTemplateProps) {
  const t = useTranslations("Navigation")
  const itemsOf = (menu: readonly DestinationId[]): NavLinkItem[] =>
    visibleDestinations(menu, config).map((id) => ({
      id,
      href: DESTINATIONS[id].href,
      label: t(DESTINATIONS[id].label),
      badge: config ? <UnreadBadge count={unreadSources[id]} /> : undefined
    }))

  if (!config) {
    return (
      <NavigationFrame
        end={
          <nav aria-label={t("primary")} className="flex items-center gap-1.5">
            <NavLinks items={itemsOf(MENUS.topBar)} />
            <ThemeSwitch />
          </nav>
        }
      />
    )
  }

  return (
    <>
      <CollapsingHeader
        links={<TopNavigation items={itemsOf(MENUS.topBar)} />}
        end={
          <div className="md:hidden">
            <MobileNavigation
              items={itemsOf(MENUS.sheet)}
              indicator={<UnreadIndicator counts={Object.values(unreadSources)} />}
            />
          </div>
        }
        // One menu for every screen size: a second would share its Motion layoutIds and break the morph.
        account={<AccountMenu user={config.user} />}
      />
      <RefreshOnReturn />
    </>
  )
}

/** The header before it is known who is looking: the shapes of what a signed-in User sees. */
function NavigationPlaceholder() {
  return (
    <NavigationFrame
      aria-busy
      links={<Skeleton className="h-5 w-80 lg:w-120" />}
      account={<Skeleton className="size-9 rounded-full" />}
    />
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
