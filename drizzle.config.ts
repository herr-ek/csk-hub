import { defineConfig } from "drizzle-kit"
import { announceTarget, resolveOrExit } from "./scripts/ops/target"

// Relative imports: drizzle-kit bundles this config without reading tsconfig paths.
const database = resolveOrExit()

// Every drizzle-kit command loads this config before it opens a connection, so it is the
// one place that can warn about a production target however drizzle-kit was reached —
// including `bunx drizzle-kit` run by hand, which no package.json script guards.
announceTarget(database)

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: database.url
  }
})
