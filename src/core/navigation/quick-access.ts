import { QUICK_ACCESS_LIMIT } from "@/core/preferences/schema"
import { isAdminRoute, type MenuRouteId } from "./site"

/**
 * The saved shortcuts a member may currently use. Admin routes are hidden rather than deleted for members who are not
 * admins, so regaining the role brings them back.
 */
export function visibleQuickAccess(ids: readonly MenuRouteId[], { isAdmin }: { isAdmin: boolean }): MenuRouteId[] {
  return isAdmin ? [...ids] : ids.filter((id) => !isAdminRoute(id))
}

/** Adds a shortcut at the end of the bar or removes it. Adding to a full bar leaves it unchanged. */
export function toggleShortcut(list: readonly MenuRouteId[], id: MenuRouteId): MenuRouteId[] {
  if (list.includes(id)) return list.filter((existing) => existing !== id)
  return list.length < QUICK_ACCESS_LIMIT ? [...list, id] : [...list]
}

/** Moves a shortcut `delta` places along the bar, stopping at either end. */
export function moveShortcut(list: readonly MenuRouteId[], id: MenuRouteId, delta: number): MenuRouteId[] {
  const from = list.indexOf(id)
  if (from === -1) return [...list]
  const to = Math.min(Math.max(from + delta, 0), list.length - 1)
  const next = list.filter((existing) => existing !== id)
  next.splice(to, 0, id)
  return next
}
