import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "@/core/config/env"

const databaseUrl = new URL(env.POSTGRES_URL)

// TODO: Remove in prod!
databaseUrl.searchParams.set("sslmode", "no-verify")

export const db = drizzle(databaseUrl.toString())
