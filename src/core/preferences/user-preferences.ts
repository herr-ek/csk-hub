import "server-only"

import { eq, sql } from "drizzle-orm"
import { db } from "@/core/db"
import { userPreferences } from "@/core/db/schema/user-preferences"
import {
  type UserPreferences,
  type UserPreferencesUpdate,
  userPreferencesSchema,
  userPreferencesUpdateSchema
} from "./schema"

/**
 * Loads and validates the preferences stored for a user.
 *
 * @param userId - The Better Auth user whose preferences should be loaded.
 * Missing fields and rows receive application defaults. Malformed documents safely resolve to all defaults.
 *
 * @returns A complete, validated preferences object.
 * @throws A database error when the preferences query fails.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const [record] = await db
    .select({ preferences: userPreferences.preferences })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  return userPreferencesSchema.parse(record?.preferences)
}

/**
 * Validates and atomically merges fields into a user's preferences JSON.
 * Existing fields omitted from the update are preserved, and a preferences row is created when needed.
 * A malformed stored document is replaced by the validated update instead of being merged into another invalid value.
 *
 * @param userId - The Better Auth user whose preferences should be updated.
 * @param input - A partial preferences object validated by `userPreferencesUpdateSchema`.
 * @throws A Zod error when `input` is invalid, or a database error when the upsert fails.
 */
export async function updateUserPreferences(userId: string, input: UserPreferencesUpdate): Promise<void> {
  const preferences = userPreferencesUpdateSchema.parse(input)

  await db
    .insert(userPreferences)
    .values({ userId, preferences })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        preferences: sql`CASE
          WHEN jsonb_typeof(${userPreferences.preferences}) = 'object'
            THEN ${userPreferences.preferences} || excluded.preferences
          ELSE excluded.preferences
        END`
      }
    })
}
