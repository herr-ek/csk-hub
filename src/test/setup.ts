import { prepareTestDatabase, testDatabaseUrl } from "./db";

// Point every module that reads the connection string at the test database
// before any of them are imported. The Vercel-injected names would otherwise
// win over DATABASE_URL inside `src/lib/db`.
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_URL_NON_POOLING;

const url = testDatabaseUrl();
process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-outside-tests";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

await prepareTestDatabase();
