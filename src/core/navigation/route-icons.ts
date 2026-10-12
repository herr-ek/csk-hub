import {
  Bell,
  CircleUser,
  type LucideIcon,
  MessageCircle,
  Music,
  Newspaper,
  Settings,
  Shield,
  SquarePen,
  User,
  Users
} from "lucide-react"
import type { MenuRouteId } from "./site"

/** An icon for every menu route, for compact surfaces such as the quick-access bar. Admin icons match the admin cards. */
export const ROUTE_ICONS: Record<MenuRouteId, LucideIcon> = {
  news: Newspaper,
  newsCompose: SquarePen,
  messages: MessageCircle,
  account: CircleUser,
  accountSettings: Settings,
  admin: Shield,
  adminUsers: User,
  adminNotifications: Bell,
  adminOrgStructure: Music,
  adminOrgStructureGroups: Users
}
