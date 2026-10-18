export const ROUTES = {
  home: "/",
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  activate: "/activate",
  activationFailed: "/activation-failed",
  twoFactor: "/two-factor",
  news: "/news",
  newsCompose: "/news/new",
  events: "/events",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminNotifications: "/admin/notifications",
  adminOrgStructure: "/admin/org-structure",
  adminOrgStructureGroups: "/admin/org-structure/groups",
  adminEvents: "/admin/events",
  adminEventsNew: "/admin/events/new",
  adminEventLocations: "/admin/events/locations",
  account: "/me",
  accountEditProfile: "/me/edit",
  messages: "/messages",
  members: "/members",
  accountSettings: "/me/settings"
} as const

export type RouteId = keyof typeof ROUTES
export type NavigationRouteId = Exclude<RouteId, "home">

/** Signed-in routes that have a place in the menu hierarchy, each labelled by `Navigation.routes.<id>`. */
export type MenuRouteId =
  | "news"
  | "newsCompose"
  | "events"
  | "messages"
  | "account"
  | "accountSettings"
  | "admin"
  | "adminUsers"
  | "adminNotifications"
  | "adminOrgStructure"
  | "adminOrgStructureGroups"
  | "adminEvents"
  | "adminEventsNew"
  | "adminEventLocations"

/** Where each nested route sits in the menu hierarchy; routes without an entry are top-level sections. */
export const ROUTE_PARENTS: Partial<Record<MenuRouteId, MenuRouteId>> = {
  newsCompose: "news",
  accountSettings: "account",
  adminUsers: "admin",
  adminNotifications: "admin",
  adminOrgStructure: "admin",
  adminOrgStructureGroups: "admin",
  adminEvents: "admin",
  adminEventsNew: "adminEvents",
  adminEventLocations: "adminEvents"
}

/** The route and its ancestors, from the top-level section down to `id`. */
export function routeTrail(id: MenuRouteId): MenuRouteId[] {
  const trail: MenuRouteId[] = [id]
  for (let parent = ROUTE_PARENTS[id]; parent; parent = ROUTE_PARENTS[parent]) trail.unshift(parent)
  return trail
}
