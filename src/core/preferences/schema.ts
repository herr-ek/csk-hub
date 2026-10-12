import { z } from "zod"
import { localeSchema } from "@/core/i18n/locale-validation"
import { MENU_ROUTE_IDS, type MenuRouteId } from "@/core/navigation/site"

/** How many shortcuts fit in the quick-access bar next to its Menu button. */
export const QUICK_ACCESS_LIMIT = 4

const menuRouteIdSchema = z.enum(MENU_ROUTE_IDS)

const quickAccessSchema = z
  .array(menuRouteIdSchema)
  .max(QUICK_ACCESS_LIMIT)
  .refine((ids) => new Set(ids).size === ids.length, "Shortcuts must be unique")

const preferenceValuesSchema = z.object({
  locale: localeSchema.nullable(),
  /** Whether the quick-access bar is shown. Turning it off keeps the chosen shortcuts for when it is turned back on. */
  quickAccessEnabled: z.boolean(),
  /** The member's quick-access shortcuts in bar order. An empty list also leaves the bar hidden. */
  quickAccess: quickAccessSchema
})

export type UserPreferences = z.infer<typeof preferenceValuesSchema>

/** Complete application defaults for users with missing or older stored preferences. */
export const userPreferencesDefaults = {
  locale: null,
  quickAccessEnabled: true,
  quickAccess: ["news", "messages"]
} satisfies UserPreferences

/**
 * Keeps the usable shortcuts from a stored list, so a route removed in a later release costs only that shortcut
 * instead of failing the whole document and resetting the member's other preferences.
 */
const storedQuickAccessSchema = z
  .array(z.unknown())
  .transform((ids) =>
    [...new Set(ids)]
      .filter((id): id is MenuRouteId => menuRouteIdSchema.safeParse(id).success)
      .slice(0, QUICK_ACCESS_LIMIT)
  )
  .catch(userPreferencesDefaults.quickAccess)

/**
 * Reads stored preferences into the complete shape expected by callers.
 * Missing fields are merged with the defaults, unknown future fields are ignored, and malformed documents fall back.
 */
export const userPreferencesSchema = preferenceValuesSchema
  .extend({
    quickAccessEnabled: z.boolean().catch(userPreferencesDefaults.quickAccessEnabled),
    quickAccess: storedQuickAccessSchema
  })
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
