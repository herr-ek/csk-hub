"use server"

import { AuthorizationDeniedError, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import type { Locale } from "@/core/i18n/locales"
import { updateUserPreferences } from "@/core/preferences"

/**
 * Saves the current member's locale preference without replacing their other preferences.
 *
 * @param locale - The supported locale to store. The core preferences schema validates it again at runtime.
 * @returns Whether an authenticated member was available and the preference was saved.
 * @throws A validation or database error when an authenticated member's update cannot be persisted.
 */
export async function updateLocalePreference(locale: Locale) {
  try {
    await db.transaction(async (tx) => {
      const actor = await requirePermission({ action: "app.access" }, tx)
      await updateUserPreferences(actor.userId, { locale }, tx)
    })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return { success: false as const }
    throw error
  }
  return { success: true as const }
}
