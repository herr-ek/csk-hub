import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The database tests run against. Prefers an explicit `TEST_DATABASE_URL`,
 * otherwise derives one from `DATABASE_URL` by suffixing the database name.
 *
 * The suite creates databases, migrates them, and truncates every table in
 * them, so deriving is only safe against a local server. A `DATABASE_URL`
 * pointing anywhere else — a hosted database in `.env`, say — is refused rather
 * than suffixed, because the derived name would be created on that same remote
 * server. Point `TEST_DATABASE_URL` at a throwaway database to override.
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
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to derive a test database from a non-local DATABASE_URL (${url.hostname}). ` +
        "The suite creates and truncates databases on whatever server it is pointed at. " +
        "Start the local Postgres with `docker compose up -d` and set TEST_DATABASE_URL, " +
        "e.g. postgresql://csk_hub:csk_hub@localhost:5433/csk_hub_test",
    );
  }

  url.pathname = `${url.pathname.replace(/\/$/, "")}_test`;
  return url.toString();
}

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

/**
 * Empties every table. Call in `beforeEach` so tests never inherit rows. The
 * table list is read from the database rather than hardcoded, so a new table
 * does not silently start leaking state between tests. Drizzle's own migration
 * bookkeeping is excluded — truncating it would strand the schema.
 */
export async function resetTestDatabase(): Promise<void> {
  const { rows } = await testPool().query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
  );
  if (rows.length === 0) return;

  const list = rows.map((row) => `"${row.tablename}"`).join(", ");
  await testPool().query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function closeTestDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
