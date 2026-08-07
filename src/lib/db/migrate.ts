import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Missing POSTGRES_URL_NON_POOLING or DATABASE_URL environment variable",
  );
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function main() {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
