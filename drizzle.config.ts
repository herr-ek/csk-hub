import { defineConfig } from "drizzle-kit"

// POSTGRES_URL_NON_POOLING is the direct connection Vercel injects when a
// Supabase project is linked; migrations should not run through the
// transaction pooler. DATABASE_URL is used for local dev.
// BUT ssl require does not work on Vercel Hobby plan!
const DATABASE_URL = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING

if (!DATABASE_URL) {
  throw Error("DATABASE_URL is not set")
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: DATABASE_URL
  }
})
