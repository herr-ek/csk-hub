import { defineConfig } from "drizzle-kit"
// Relative import: drizzle-kit bundles this config without reading tsconfig paths.
import { secureConnection } from "./src/core/db/tls"

// Which database this is was decided before drizzle-kit started: `.env` for local work, or
// the ops CLI, which passes its selected target in as POSTGRES_URL.
const POSTGRES_URL = process.env.POSTGRES_URL

if (!POSTGRES_URL) {
  throw Error("POSTGRES_URL is not set")
}

const { connectionString, ssl } = secureConnection(POSTGRES_URL)
const connection = new URL(connectionString)

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema",
  out: "./drizzle",
  // v1's URL form excludes explicit TLS options. Use fields so Kit keeps our CA policy.
  dbCredentials: {
    host: connection.hostname.replace(/^\[|\]$/g, ""),
    port: Number(connection.port || 5432),
    user: decodeURIComponent(connection.username),
    password: decodeURIComponent(connection.password),
    database: decodeURIComponent(connection.pathname.slice(1)),
    ssl
  }
})
