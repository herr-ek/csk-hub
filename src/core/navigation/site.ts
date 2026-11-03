export const ROUTES = {
  home: "/",
  login: "/login",
  privacy: "/privacy",
  support: "/support",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  activate: "/activate",
  activationFailed: "/activation-failed",
  twoFactor: "/two-factor",
  news: "/news",
  newsCompose: "/news/new",
  events: "/events",
  admin: "/admin",
  adminOidcClients: "/admin/oidc-clients",
  adminUsers: "/admin/users",
  adminNotifications: "/admin/notifications",
  adminOrgStructure: "/admin/org-structure",
  adminGigGroups: "/admin/gig-groups",
  adminPositions: "/admin/positions",
  adminOrgStructureGroups: "/admin/org-structure/groups",
  eventsManage: "/events/manage",
  eventsNew: "/events/manage/new",
  eventsRehearsals: "/events/manage/rehearsals",
  adminEvents: "/admin/events",
  adminEventsNew: "/admin/events/new",
  adminEventLocations: "/admin/events/locations",
  adminAbsenceReasons: "/admin/events/absence-reasons",
  account: "/me",
  accountEditProfile: "/me/edit",
  messages: "/messages",
  members: "/members",
  accountSettings: "/me/settings"
} as const

export type RouteId = keyof typeof ROUTES

/** Signed-in routes that have a place in the menu hierarchy, each labelled by `Navigation.routes.<id>`. */
export type MenuRouteId =
  | "news"
  | "events"
  | "eventsManage"
  | "eventsNew"
  | "eventsRehearsals"
  | "newsCompose"
  | "messages"
  | "account"
  | "accountSettings"
  | "admin"
  | "adminOidcClients"
  | "adminUsers"
  | "adminNotifications"
  | "adminOrgStructure"
  | "adminOrgStructureGroups"
  | "adminEvents"
  | "adminEventsNew"
  | "adminEventLocations"
  | "adminAbsenceReasons"
  | "adminGigGroups"
  | "adminPositions"

/** Where each nested route sits in the menu hierarchy; routes without an entry are top-level sections. */
export const ROUTE_PARENTS: Partial<Record<MenuRouteId, MenuRouteId>> = {
  eventsManage: "events",
  eventsNew: "eventsManage",
  eventsRehearsals: "eventsManage",
  newsCompose: "news",
  accountSettings: "account",
  adminOidcClients: "admin",
  adminUsers: "admin",
  adminNotifications: "admin",
  adminOrgStructure: "admin",
  adminOrgStructureGroups: "admin",
  adminEvents: "admin",
  adminEventsNew: "adminEvents",
  adminEventLocations: "adminEvents",
  adminAbsenceReasons: "adminEvents",
  adminGigGroups: "admin",
  adminPositions: "admin"
}

/** The route and its ancestors, from the top-level section down to `id`. */
export function routeTrail(id: MenuRouteId): MenuRouteId[] {
  const trail: MenuRouteId[] = [id]
  for (let parent = ROUTE_PARENTS[id]; parent; parent = ROUTE_PARENTS[parent]) trail.unshift(parent)
  return trail
}
