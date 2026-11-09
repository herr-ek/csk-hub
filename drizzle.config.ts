import { defineConfig } from "drizzle-kit"

// Which database this is was decided before drizzle-kit started: `.env` for local work, the
// ops CLI, which passes its selected target in as POSTGRES_URL, or the stack's `migrate` service.
const POSTGRES_URL = process.env.POSTGRES_URL

if (!POSTGRES_URL) {
  throw Error("POSTGRES_URL is not set")
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema",
  out: "./drizzle",
  // TLS follows the connection string's own `sslmode`, as it does for the application.
  dbCredentials: { url: POSTGRES_URL }
})
