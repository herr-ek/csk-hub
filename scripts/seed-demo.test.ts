import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { verifyPassword } from "better-auth/crypto"
import { eq } from "drizzle-orm"
import { Client } from "pg"
import { account, user } from "@/core/db/schema/auth"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { post } from "@/core/db/schema/posts"
import { voiceCapability } from "@/core/db/schema/voice"
import { postDocument } from "@/features/posts/post-document"
import { createTestDatabase } from "../test/database"
import { insertReferenceData } from "./ops/reference-data"
import { SEED_PASSWORD, SEED_USERS } from "./ops/seed-data"
import { seedDemo } from "./seed-demo"

const database = await createTestDatabase()

describe.skipIf(!database)("complete local demo seed", () => {
  if (!database) return
  const { db, drop, url } = database
  afterAll(drop)
  beforeAll(async () => {
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      await insertReferenceData(client)
    } finally {
      await client.end()
    }
    const result = await seedDemo(db)
    expect(result.users.created).toBe(100)
    expect(result.groups.placed).toBe(100)
    expect(result.posts.created).toBe(24)
  }, 30_000)

  test("creates 100 usable, verified identities with a shared seed password hash and three Admins", async () => {
    const users = await db.select().from(user)
    const accounts = await db.select().from(account)
    expect(users).toHaveLength(100)
    expect(new Set(users.map(({ name }) => name)).size).toBe(100)
    expect(users.every(({ emailVerified, username }) => emailVerified && username)).toBe(true)
    expect(users.filter(({ role }) => role === "admin")).toHaveLength(3)
    expect(accounts).toHaveLength(100)
    expect(new Set(accounts.map(({ password }) => password)).size).toBe(1)
    const credential = accounts.find(({ userId }) => userId === SEED_USERS[0]?.id)
    expect(credential).toMatchObject({ providerId: "credential", accountId: SEED_USERS[0]?.id })
    expect(await verifyPassword({ hash: credential?.password as string, password: SEED_PASSWORD })).toBe(true)
  })

  test("balances 100 singers across three Choirs and twelve Sections with correct division assignments", async () => {
    const groups = await db.select().from(group)
    const memberships = await db.select().from(directMembership)
    const current = memberships.filter(({ endDate }) => !endDate)
    const choirs = groups.filter(({ type }) => type === "Choir")
    expect(choirs.map(({ id }) => current.filter(({ groupId }) => groupId === id).length).sort()).toEqual([33, 33, 34])
    for (const choir of choirs) {
      const sections = groups.filter(({ choirId, type }) => choirId === choir.id && type === "Section")
      expect(sections).toHaveLength(4)
      const sizes = sections.map(({ id }) => current.filter(({ groupId }) => groupId === id).length)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
    for (const singer of SEED_USERS) {
      const placements = current.filter(({ userId }) => userId === singer.id)
      expect(
        placements.filter(({ groupId }) => groups.find(({ id }) => id === groupId)?.type === "Choir")
      ).toHaveLength(1)
      const sections = placements.filter(({ groupId }) => groups.find(({ id }) => id === groupId)?.type === "Section")
      expect(sections).toHaveLength(1)
      expect(sections[0]?.voice).toMatch(/^[SATB][12]$/)
    }
    expect(memberships.filter(({ endDate, voice }) => endDate && voice).length).toBeGreaterThanOrEqual(15)
    const capabilities = await db.select().from(voiceCapability)
    expect(capabilities.length).toBeGreaterThan(100)
    expect(new Set(capabilities.map(({ userId }) => userId)).size).toBeLessThan(100)
  })

  test("publishes varied valid documents, then reruns without duplicates or overwriting edited fixtures", async () => {
    const posts = await db.select().from(post)
    const users = await db.select().from(user)
    expect(posts).toHaveLength(24)
    expect(new Set(posts.map(({ publishedAt }) => publishedAt?.toISOString())).size).toBe(24)
    for (const row of posts) {
      expect(postDocument.parse(JSON.stringify(row.body))).toEqual(row.body)
      expect(users.find(({ id }) => id === row.authorId)?.role).toBe("admin")
      expect(row.publishedAt?.getTime()).toBeLessThanOrEqual(Date.UTC(2026, 9, 12))
    }
    const first = posts[0] as typeof post.$inferSelect
    await db.update(post).set({ title: "Locally edited announcement" }).where(eq(post.id, first.id))
    const before = {
      memberships: await db.select().from(directMembership),
      holdings: await db.select().from(positionAppointment),
      credentials: await db.select().from(account)
    }
    expect(await seedDemo(db)).toEqual({
      users: { created: 0 },
      groups: { created: [], placed: 0 },
      posts: { created: 0 }
    })
    expect(await db.select().from(directMembership)).toEqual(before.memberships)
    expect(await db.select().from(positionAppointment)).toEqual(before.holdings)
    expect(await db.select().from(account)).toEqual(before.credentials)
    expect(await db.select().from(post).where(eq(post.id, first.id))).toMatchObject([
      { title: "Locally edited announcement" }
    ])
    expect(await db.select().from(post)).toHaveLength(24)
  })

  test("ops runs the complete demo and every new seed entrypoint refuses a production target", async () => {
    const repeated = await runScript(["scripts/ops/index.ts", "seed-demo"], url)
    expect(repeated.code).toBe(0)
    expect(repeated.stdout).toContain("Created 0 users")
    const production = await runScript(["scripts/ops/index.ts", "seed-demo", "--prod"], url)
    expect(production.code).toBe(1)
    expect(production.stdout + production.stderr).toContain("local-only")
    for (const script of ["seed-demo", "seed-users", "seed-groups", "seed-posts"]) {
      const refused = await runScript([`scripts/${script}.ts`], "postgresql://seed:seed@example.invalid/csk")
      expect(refused.code).toBe(1)
      expect(refused.stderr).toContain("local-only")
    }
  })
})

async function runScript(args: string[], url: string) {
  const child = Bun.spawn([process.execPath, "run", ...args], {
    env: { ...process.env, POSTGRES_URL: url },
    stdout: "pipe",
    stderr: "pipe"
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ])
  return { code, stdout, stderr }
}
