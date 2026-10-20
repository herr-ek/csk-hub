import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { secureConnection } from "@/core/db/tls"
import { inventoryOrganisation } from "@/features/org-structure/reconciliation"

// Launched only by ops, which resolves the target and enables the react-server condition.
const url = process.env.POSTGRES_URL
if (!url) throw new Error("POSTGRES_URL is not set")
const database = drizzle({ connection: secureConnection(url) })
try {
  const report = await database.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`)
    return inventoryOrganisation(tx)
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  await database.$client.end()
}
