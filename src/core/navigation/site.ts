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
  adminOrgStructureGroups: "/admin/org-structure/groups",
  account: "/me",
  messages: "/messages",
  accountSettings: "/me/settings"
} as const

export type RouteId = keyof typeof ROUTES
export type NavigationRouteId = Exclude<RouteId, "home">

/** Signed-in routes that have a place in the menu hierarchy, each labelled by `Navigation.routes.<id>`. */
export const MENU_ROUTE_IDS = [
  "home",
  "news",
  "newsCompose",
  "messages",
  "account",
  "accountSettings",
  "admin",
  "adminUsers",
  "adminNotifications",
  "adminOrgStructure",
  "adminOrgStructureGroups"
] as const satisfies readonly RouteId[]

export type MenuRouteId = (typeof MENU_ROUTE_IDS)[number]

/** Where each nested route sits in the menu hierarchy; routes without an entry are top-level sections. */
export const ROUTE_PARENTS: Partial<Record<MenuRouteId, MenuRouteId>> = {
  newsCompose: "news",
  accountSettings: "account",
  adminUsers: "admin",
  adminNotifications: "admin",
  adminOrgStructure: "admin",
  adminOrgStructureGroups: "admin"
}

/** The route and its ancestors, from the top-level section down to `id`. */
export function routeTrail(id: MenuRouteId): MenuRouteId[] {
  const trail: MenuRouteId[] = [id]
  for (let parent = ROUTE_PARENTS[id]; parent; parent = ROUTE_PARENTS[parent]) trail.unshift(parent)
  return trail
}

/** Whether a route sits in the admin section, which only admins may open. */
export function isAdminRoute(id: MenuRouteId) {
  return routeTrail(id)[0] === "admin"
}
