import type { DestinationId } from "./destinations"

/**
 * How many things are unread for a User at a navigation destination. Wrap it in React
 * `cache()`: a destination's badge and the mobile menu's dot ask for it in the same render.
 */
export type UnreadCount = (userId: string) => Promise<number>

/**
 * The unread count each destination shows beside its link. The navigation must not depend on
 * features, so the app layout, which composes them, passes this map in; a destination missing
 * from it shows no badge.
 */
export type UnreadSources = Partial<Record<DestinationId, UnreadCount>>
