import {
  CalendarDays,
  CircleUser,
  House,
  LogIn,
  type LucideIcon,
  MessageCircle,
  Newspaper,
  Shield,
  Users
} from "lucide-react"
import { ROUTES } from "./site"

type Destination = {
  href: string
  /** The key of its name in the `Navigation` messages. */
  label: "events" | "news" | "messages" | "members" | "admin" | "login" | "profile" | "routes.home"
  icon: LucideIcon
  audience: "member" | "admin" | "signedOut"
}

/** Everything the navigation can link to. Client Components look destinations up by id, since an icon can't be a prop. */
export const DESTINATIONS = {
  home: { href: ROUTES.home, label: "routes.home", icon: House, audience: "member" },
  events: { href: ROUTES.events, label: "events", icon: CalendarDays, audience: "member" },
  news: { href: ROUTES.news, label: "news", icon: Newspaper, audience: "member" },
  messages: { href: ROUTES.messages, label: "messages", icon: MessageCircle, audience: "member" },
  members: { href: ROUTES.members, label: "members", icon: Users, audience: "member" },
  account: { href: ROUTES.account, label: "profile", icon: CircleUser, audience: "member" },
  admin: { href: ROUTES.admin, label: "admin", icon: Shield, audience: "admin" },
  login: { href: ROUTES.login, label: "login", icon: LogIn, audience: "signedOut" }
} as const satisfies Record<string, Destination>

export type DestinationId = keyof typeof DESTINATIONS

/** What each menu offers, in order. Use `visibleDestinations` to leave out what the viewer may not see. */
export const MENUS = {
  /** The links in the header from `md` up, and the login link on every screen. */
  topBar: ["events", "news", "messages", "members", "admin", "login"],
  /** The sheet behind the menu button on small screens. */
  sheet: ["news", "events", "messages", "members", "admin"],
  /** The bar at the bottom of small screens. */
  quickAccess: ["events", "news", "home", "messages", "account"]
} as const satisfies Record<string, readonly DestinationId[]>

/** The menu's destinations for a viewer, or for a signed-out visitor when `viewer` is null. */
export function visibleDestinations<Id extends DestinationId>(
  menu: readonly Id[],
  viewer: { showAdmin: boolean } | null
) {
  return menu.filter((id) => {
    const { audience } = DESTINATIONS[id]
    if (!viewer) return audience === "signedOut"
    return audience === "member" || (audience === "admin" && viewer.showAdmin)
  })
}
