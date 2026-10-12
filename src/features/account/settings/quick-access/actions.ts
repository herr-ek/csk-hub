"use server"

import { refresh } from "next/cache"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { getRequestSession } from "@/core/auth/session.server"
import { isAdminRoute, type MenuRouteId } from "@/core/navigation/site"
import { updateUserPreferences } from "@/core/preferences"

/**
 * Saves the current member's quick-access shortcuts, in bar order, and refreshes the page so the bar shows them.
 *
 * @param shortcuts - The menu routes to pin. The core preferences schema validates ids, uniqueness and the limit.
 * @returns Whether the member was signed in and allowed every shortcut; admin routes are refused to non-admins.
 * @throws A validation or database error when an allowed update cannot be persisted.
 */
export async function updateQuickAccess(shortcuts: MenuRouteId[]) {
  const session = await getRequestSession()
  if (!session) return { success: false as const }
  if (shortcuts.some(isAdminRoute) && !(await isUserAdmin(session))) return { success: false as const }

  await updateUserPreferences(session.user.id, { quickAccess: shortcuts })
  refresh()
  return { success: true as const }
}
