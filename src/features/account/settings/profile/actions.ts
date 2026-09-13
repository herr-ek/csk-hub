"use server"

import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return { success: false as const }
  }

  await updateUserPreferences(session.user.id, { locale })
  return { success: true as const }
}
