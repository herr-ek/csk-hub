import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { verifyPassword } from "better-auth/crypto"
import { eq } from "drizzle-orm"
import { Client } from "pg"
import { account, user } from "@/core/db/schema/auth"
import {
  group,
  groupMember,
  groupTypePosition,
  position,
  positionGroup,
  positionHolder
} from "@/core/db/schema/org-structure"
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
    const memberships = await db.select().from(groupMember)
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

  test("Memberships and Position histories preserve the organization rules, including archived projects", async () => {
    const groups = await db.select().from(group)
    const memberships = await db.select().from(groupMember)
    const holdings = await db.select().from(positionHolder)
    const allowed = await db.select().from(groupTypePosition)
    const limits = await db.select().from(positionGroup)
    expect(groups.filter(({ active }) => !active).length).toBeGreaterThanOrEqual(6)
    expect(holdings.filter(({ endDate }) => endDate).length).toBeGreaterThan(40)
    expect(holdings.filter(({ endDate }) => !endDate).length).toBeGreaterThan(40)
    for (const membership of memberships) {
      const owning = groups.find(({ id }) => id === membership.groupId)
      if (owning?.choirId) {
        expect(
          memberships.some(
            (choir) =>
              choir.userId === membership.userId && choir.groupId === owning.choirId && covers(choir, membership)
          )
        ).toBe(true)
      }
      if (owning && !owning.active) expect(membership.endDate).not.toBeNull()
    }
    for (const holding of holdings) {
      const owning = groups.find(({ id }) => id === holding.groupId)
      expect(
        memberships.some(
          (membership) =>
            membership.userId === holding.userId &&
            membership.groupId === holding.groupId &&
            covers(membership, holding)
        )
      ).toBe(true)
      expect(allowed.some(({ type, positionId }) => type === owning?.type && positionId === holding.positionId)).toBe(
        true
      )
      const restricted = limits.filter(({ positionId }) => positionId === holding.positionId)
      if (restricted.length) expect(restricted.some(({ groupId }) => groupId === holding.groupId)).toBe(true)
      if (!holding.endDate && owning?.type === "Board") {
        expect(
          holdings.filter(
            (other) => other.userId === holding.userId && other.groupId === holding.groupId && !other.endDate
          )
        ).toHaveLength(1)
      }
      if (owning && !owning.active) expect(holding.endDate).not.toBeNull()
    }
    for (const [index, row] of memberships.entries()) {
      expect(
        memberships
          .slice(index + 1)
          .some((other) => row.userId === other.userId && row.groupId === other.groupId && overlaps(row, other))
      ).toBe(false)
    }
    for (const [index, row] of holdings.entries()) {
      expect(
        holdings
          .slice(index + 1)
          .some((other) => row.positionId === other.positionId && row.groupId === other.groupId && overlaps(row, other))
      ).toBe(false)
    }
  })

  test("linked offices retain both Group contexts and Choir-specific limits", async () => {
    const groups = await db.select().from(group)
    const positions = await db.select().from(position)
    const holdings = (await db.select().from(positionHolder)).filter(({ endDate }) => !endDate)
    const board = groups.find(({ name }) => name === "Styret 26/27")
    for (const title of ["Sexmästare", "Gigmästare", "1:a Konsertmästare"]) {
      const id = positions.find(({ name }) => name === title)?.id
      const elected = holdings.find(({ groupId, positionId }) => groupId === board?.id && positionId === id)
      expect(elected).toBeDefined()
      expect(holdings.filter(({ userId, positionId }) => userId === elected?.userId && positionId === id)).toHaveLength(
        2
      )
    }
    for (const choir of ["MK", "DK", "KK"]) {
      const id = positions.find(({ name }) => name === `Gigmästare ${choir}`)?.id
      const rows = holdings.filter(({ positionId }) => positionId === id)
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map(({ userId }) => userId)).size).toBe(1)
      expect(rows.map(({ groupId }) => groups.find(({ id }) => id === groupId)?.name).sort()).toEqual(
        ["Gigmästeri", choir].sort()
      )
    }
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
      memberships: await db.select().from(groupMember),
      holdings: await db.select().from(positionHolder),
      credentials: await db.select().from(account)
    }
    expect(await seedDemo(db)).toEqual({
      users: { created: 0 },
      groups: { created: [], placed: 0 },
      posts: { created: 0 }
    })
    expect(await db.select().from(groupMember)).toEqual(before.memberships)
    expect(await db.select().from(positionHolder)).toEqual(before.holdings)
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

  test("a conflicting Position preserves its holder and rolls back all new demo data", async () => {
    const [board] = await db.select().from(group).where(eq(group.name, "Styret 26/27"))
    const [office] = await db.select().from(position).where(eq(position.name, "Ordförande"))
    if (!board || !office) throw new Error("The demo Board is missing.")
    const outsider = "existing-local-chair"
    await db.insert(user).values({ id: outsider, name: "Existing chair", email: "existing-chair@example.com" })
    const current = (await db.select().from(positionHolder)).find(
      (row) => row.groupId === board.id && row.positionId === office.id && !row.endDate
    )
    if (!current) throw new Error("The demo chair is missing.")
    await db.delete(positionHolder).where(eq(positionHolder.userId, current.userId))
    await db.insert(groupMember).values({ userId: outsider, groupId: board.id, startDate: "2026-07-01" })
    await db
      .insert(positionHolder)
      .values({ userId: outsider, groupId: board.id, positionId: office.id, startDate: "2026-07-01" })
    const erased = SEED_USERS[99]?.id as string
    await db.delete(user).where(eq(user.id, erased))
    const beforeMemberships = await db.select().from(groupMember)
    await expect(seedDemo(db)).rejects.toThrow()
    expect(await db.select().from(user).where(eq(user.id, erased))).toEqual([])
    expect(await db.select().from(account).where(eq(account.userId, erased))).toEqual([])
    expect(await db.select().from(groupMember)).toEqual(beforeMemberships)
    expect(await db.select().from(positionHolder).where(eq(positionHolder.userId, outsider))).toHaveLength(1)
  })
})

type Period = { startDate: string; endDate: string | null }

function covers(outer: Period, inner: Period) {
  return (
    outer.startDate <= inner.startDate && (!outer.endDate || Boolean(inner.endDate && outer.endDate >= inner.endDate))
  )
}

function overlaps(a: Period, b: Period) {
  return a.startDate < (b.endDate ?? "9999-12-31") && b.startDate < (a.endDate ?? "9999-12-31")
}

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
