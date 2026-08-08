import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * The database tests run against. Derived from `DATABASE_URL` by suffixing the
 * database name, so a stray run can never touch development data. Override with
 * `TEST_DATABASE_URL` to point somewhere else entirely.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "Set DATABASE_URL (or TEST_DATABASE_URL) before running the tests.",
    );
  }

  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}_test`;
  return url.toString();
}

/** Every table the auth schema owns, in no particular order — TRUNCATE cascades. */
const TABLES = ["user", "session", "account", "verification"] as const;

/**
 * Creates the test database if it is missing and brings it up to the latest
 * migration. Runs once per test process, from the preload.
 */
export async function prepareTestDatabase(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const existing = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (existing.rowCount === 0) {
      // Identifiers cannot be parameterised; the name comes from our own URL.
      await adminPool.query(
        `CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`,
      );
    }
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({ connectionString: url.toString() });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

let pool: Pool | undefined;

function testPool(): Pool {
  pool ??= new Pool({ connectionString: testDatabaseUrl() });
  return pool;
}

/** Empties every table. Call in `beforeEach` so tests never inherit rows. */
export async function resetTestDatabase(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(", ");
  await testPool().query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function closeTestDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
