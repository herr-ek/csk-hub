import { isUserAdmin } from "@/core/auth/permissions.server"
import { getRequestSession } from "@/core/auth/session.server"
import { visibleQuickAccess } from "@/core/navigation/quick-access"
import { isAdminRoute, MENU_ROUTE_IDS } from "@/core/navigation/site"
import { getUserPreferences } from "@/core/preferences"
import { QuickAccessSettingsCard } from "./QuickAccessSettingsCard"

/** Lets the member choose and order the shortcuts in their quick-access bar. */
export async function QuickAccessSettings() {
  const session = await getRequestSession()
  if (!session) return null

  const [isAdmin, preferences] = await Promise.all([isUserAdmin(session), getUserPreferences(session.user.id)])
  // Hidden admin shortcuts are left out of the editor, so saving cannot carry routes the member may not pin.
  const saved = visibleQuickAccess(preferences.quickAccess, { isAdmin })
  const eligible = MENU_ROUTE_IDS.filter((id) => isAdmin || !isAdminRoute(id))

  return <QuickAccessSettingsCard saved={saved} eligible={eligible} />
}
