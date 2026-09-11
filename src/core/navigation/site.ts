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
  adminMembers: "/admin/members",
  adminNotifications: "/admin/notifications",
  account: "/me",
  accountSettings: "/me/settings"
} as const

export type RouteId = keyof typeof ROUTES
export type NavigationRouteId = Exclude<RouteId, "home">
