import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { betterAuth } from "better-auth"
import { eq } from "drizzle-orm"
import * as schema from "@/core/db/schema/auth"
import { createTestDatabase } from "./database"

const disposable = await createTestDatabase()
if (!disposable) throw new Error("OIDC browser tests require local PostgreSQL")
const database = disposable
const fixture = betterAuth({
  baseURL: "http://localhost:3107",
  secret: "oidc-browser-fixture-secret-at-least-32-characters",
  database: drizzleAdapter(database.db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true }
})
const account = await fixture.api.signUpEmail({
  body: {
    name: "Browser Singer",
    email: "browser@example.com",
    password: "browser-test-password"
  }
})
await database.db
  .update(schema.user)
  .set({ emailVerified: true, role: "admin" })
  .where(eq(schema.user.id, account.user.id))
const certificates = mkdtempSync(join(tmpdir(), "csk-oidc-browser-"))
const generated = Bun.spawnSync(
  [
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    join(certificates, "key.pem"),
    "-out",
    join(certificates, "cert.pem"),
    "-subj",
    "/CN=client.example.com"
  ],
  { stdout: "pipe", stderr: "pipe" }
)
if (generated.exitCode !== 0) throw new Error("Could not generate the disposable callback certificate")
const callbackServer = Bun.serve({
  port: 3108,
  hostname: "127.0.0.1",
  tls: { key: readFileSync(join(certificates, "key.pem")), cert: readFileSync(join(certificates, "cert.pem")) },
  fetch: () => new Response("Connected")
})
const child = Bun.spawn(["bun", "run", "dev", "--port", "3107"], {
  env: {
    ...process.env,
    POSTGRES_URL: database.url,
    ENVIRONMENT: "test",
    VERCEL_ENV: "development",
    BETTER_AUTH_URL: "http://localhost:3107",
    OIDC_ISSUER: "http://localhost:3107/api/auth",
    BETTER_AUTH_SECRET: "oidc-browser-fixture-secret-at-least-32-characters"
  },
  stdout: "inherit",
  stderr: "inherit"
})
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  child.kill("SIGTERM")
  await child.exited
  callbackServer.stop(true)
  rmSync(certificates, { recursive: true, force: true })
  await database.drop()
  process.exit(0)
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
await child.exited
await stop()
