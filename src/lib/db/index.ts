import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  // POSTGRES_URL is the pooled (Supavisor) connection Vercel injects when a
  // Supabase project is linked; DATABASE_URL is used for local dev.
  connectionString: process.env.POSTGRES_URL ?? process.env.DATABASE_URL,
});

export const db = drizzle(pool);
