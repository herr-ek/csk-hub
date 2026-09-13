import { jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").notNull()
})
