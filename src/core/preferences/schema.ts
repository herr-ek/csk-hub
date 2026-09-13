import { z } from "zod"
import { localeSchema } from "@/core/i18n/locale-validation"
import { defaultLocale } from "@/core/i18n/locales"

const preferenceValuesSchema = z.object({
  locale: localeSchema
})

export type UserPreferences = z.infer<typeof preferenceValuesSchema>

/** Complete application defaults for users with missing or older stored preferences. */
export const userPreferencesDefaults = {
  locale: defaultLocale
} satisfies UserPreferences

/**
 * Reads stored preferences into the complete shape expected by callers.
 * Missing fields are merged with the defaults, unknown future fields are ignored, and malformed documents fall back.
 */
export const userPreferencesSchema = preferenceValuesSchema
  .partial()
  .transform(
    (preferences): UserPreferences => ({
      ...userPreferencesDefaults,
      ...preferences
    })
  )
  .catch(userPreferencesDefaults)

/** Validates partial writes without applying read-time defaults or accepting unknown preference names. */
export const userPreferencesUpdateSchema = preferenceValuesSchema.partial().strict()

export type UserPreferencesUpdate = z.infer<typeof userPreferencesUpdateSchema>
