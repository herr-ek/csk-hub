import { defineConfig } from "drizzle-kit"
import { connectionFor } from "./scripts/ops/ssl"
import { announceTarget, resolveOrExit } from "./scripts/ops/target"

// Relative imports: drizzle-kit bundles this config without reading tsconfig paths.
const database = resolveOrExit()

// Every drizzle-kit command loads this config before it opens a connection, so it is the
// one place that can warn about a production target however drizzle-kit was reached —
// including `bunx drizzle-kit` run by hand, which no package.json script guards.
announceTarget(database)

const connection = connectionFor(database.url)

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema",
  out: "./drizzle",
  dbCredentials: {
    // The same connection the ops status check dials, so migrations and the status that
    // reports on them verify on identical terms.
    url: connection.url,
    ssl: connection.ssl
  }
})
