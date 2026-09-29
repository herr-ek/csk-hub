import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "@/core/config/env"
import { secureConnection } from "@/core/db/tls"

export const db = drizzle({ connection: secureConnection(env.POSTGRES_URL) })
