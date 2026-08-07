import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema",
  out: "./drizzle",
  dbCredentials: {
    // POSTGRES_URL_NON_POOLING is the direct connection Vercel injects when a
    // Supabase project is linked; migrations should not run through the
    // transaction pooler. DATABASE_URL is used for local dev.
    url: (process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL)!,
  },
});
