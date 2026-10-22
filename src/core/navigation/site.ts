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
  admin: "/admin",
  adminUsers: "/admin/users",
  adminNotifications: "/admin/notifications",
  adminOrgStructure: "/admin/org-structure",
  adminGigGroups: "/admin/gig-groups",
  adminOrgStructureGroups: "/admin/org-structure/groups",
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
  | "messages"
  | "account"
  | "accountSettings"
  | "admin"
  | "adminUsers"
  | "adminNotifications"
  | "adminOrgStructure"
  | "adminOrgStructureGroups"
  | "adminGigGroups"

/** Where each nested route sits in the menu hierarchy; routes without an entry are top-level sections. */
export const ROUTE_PARENTS: Partial<Record<MenuRouteId, MenuRouteId>> = {
  newsCompose: "news",
  accountSettings: "account",
  adminUsers: "admin",
  adminNotifications: "admin",
  adminOrgStructure: "admin",
  adminOrgStructureGroups: "admin",
  adminGigGroups: "admin"
}

/** The route and its ancestors, from the top-level section down to `id`. */
export function routeTrail(id: MenuRouteId): MenuRouteId[] {
  const trail: MenuRouteId[] = [id]
  for (let parent = ROUTE_PARENTS[id]; parent; parent = ROUTE_PARENTS[parent]) trail.unshift(parent)
  return trail
}
