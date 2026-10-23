import "server-only"

import type { NavigationRouteId } from "./site"

/**
 * How many things are unread for a User at a navigation destination. Wrap it in React
 * `cache()`: a destination's badge and the mobile menu's dot ask for it in the same render.
 */
export type UnreadCount = (userId: string) => Promise<number>

const sources = new Map<NavigationRouteId, UnreadCount>()

/**
 * Subscribes a feature to the navigation's unread badges: the destination shows the count
 * beside its link. The navigation must not depend on features, so a feature registers
 * itself when its module loads, and the app layout imports that module to switch it on.
 * Registering a destination again replaces its count, as a reloaded module does in development.
 */
export function registerUnreadSource(route: NavigationRouteId, count: UnreadCount) {
  sources.set(route, count)
}

/** The count registered for a destination, if any feature subscribed to it. */
export function getUnreadSource(route: NavigationRouteId): UnreadCount | undefined {
  return sources.get(route)
}

/** Every registered count, for telling whether anything at all is unread. */
export function listUnreadSources(): UnreadCount[] {
  return [...sources.values()]
}
