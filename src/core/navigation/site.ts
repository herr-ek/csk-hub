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
  account: "/me",
  messages: "/messages",
  accountSettings: "/me/settings"
} as const

export type RouteId = keyof typeof ROUTES
export type NavigationRouteId = Exclude<RouteId, "home">
