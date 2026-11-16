import { defineRelations } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "@/core/config/env"
import * as authSchema from "@/core/db/schema/auth"
import { secureConnection } from "@/core/db/tls"

export const db = drizzle({
  connection: { ...secureConnection(env.POSTGRES_URL), connectionTimeoutMillis: 5_000 },
  relations: { ...defineRelations(authSchema), ...authSchema.authRelations }
})

/** The application database client or an existing transaction. */
export type Database = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
