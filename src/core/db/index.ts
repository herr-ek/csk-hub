import { defineRelations } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "@/core/config/env"
import * as authSchema from "@/core/db/schema/auth"
import { secureConnection } from "@/core/db/tls"

export const db = drizzle({
  connection: secureConnection(env.POSTGRES_URL),
  relations: { ...defineRelations(authSchema), ...authSchema.authRelations }
})
