import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { verifyPassword } from "better-auth/crypto"
import { eq } from "drizzle-orm"
import { Client } from "pg"
import { account, user } from "@/core/db/schema/auth"
import { appointmentGrant, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { post } from "@/core/db/schema/posts"
import { voiceCapability } from "@/core/db/schema/voice"
import { GROUP_POLICIES, POSITION_DEFINITIONS } from "@/core/org-structure"
import { postDocument } from "@/features/posts/post-document"
import { createTestDatabase } from "../test/database"
import { insertReferenceData } from "./ops/reference-data"
import { SEED_PASSWORD, SEED_USERS, seedId } from "./ops/seed-data"
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

  test("balances 100 singers across direct Choir and Section Memberships with correct divisions", async () => {
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

  test("fixed Groups, appointments, grants, helper periods, and history match the organisation rules", async () => {
    const groups = await db.select().from(group)
    const memberships = await db.select().from(directMembership)
    const appointments = await db.select().from(positionAppointment)
    const grants = await db.select().from(appointmentGrant)
    expect(memberships.filter(({ endDate }) => endDate).length).toBeGreaterThanOrEqual(15)
    expect(appointments.length).toBeGreaterThan(30)
    expect(grants.length).toBeGreaterThan(30)
    for (const membership of memberships) {
      const owning = groups.find(({ id }) => id === membership.groupId)
      if (owning?.type === "Section") {
        expect(
          memberships.some(
            (choir) =>
              choir.userId === membership.userId && choir.groupId === owning.choirId && covers(choir, membership)
          )
        ).toBe(true)
      }
    }
    for (const appointment of appointments) {
      const definition = POSITION_DEFINITIONS[appointment.positionCode as keyof typeof POSITION_DEFINITIONS]
      expect(definition).toBeDefined()
      for (const type of definition.grants) {
        expect(
          grants
            .filter(({ appointmentId }) => appointmentId === appointment.id)
            .some((grant) =>
              groups.some(
                ({ id, type: targetType, organisationYear }) =>
                  id === grant.groupId &&
                  targetType === type &&
                  (GROUP_POLICIES[type].lifetime !== "annual" || organisationYear === appointment.organisationYear)
              )
            )
        ).toBe(true)
      }
      if (definition.prerequisite) {
        expect(
          memberships.some(
            (membership) =>
              membership.userId === appointment.userId &&
              membership.groupId === appointment.contextGroupId &&
              covers(membership, appointment)
          )
        ).toBe(true)
      }
    }
    const annual = groups.filter(({ organisationYear }) => organisationYear !== null)
    for (const year of [2026, 2027]) {
      expect(annual.filter(({ type, organisationYear }) => type === "Board" && organisationYear === year)).toHaveLength(
        1
      )
    }
    const sexmastarinna = appointments.find(({ positionCode }) => positionCode === "sexmastarinna")
    const tourFinancial = appointments.find(({ positionCode }) => positionCode === "ekonomiskt-ansvarig")
    expect(sexmastarinna).toMatchObject({ organisationYear: 2026 })
    expect(groups.find(({ id }) => id === sexmastarinna?.contextGroupId)).toMatchObject({
      type: "Sexmästeri",
      organisationYear: 2026
    })
    expect(tourFinancial).toMatchObject({ organisationYear: 2026 })
    expect(groups.find(({ id }) => id === tourFinancial?.contextGroupId)).toMatchObject({
      type: "Turnékommitté",
      organisationYear: 2026
    })
  })

  test("handover, renewal, vacancies, and Choir-specific duties retain their contexts", async () => {
    const groups = await db.select().from(group)
    const appointments = await db.select().from(positionAppointment)
    const board26 = groups.find(({ type, organisationYear }) => type === "Board" && organisationYear === 2026)
    const board27 = groups.find(({ type, organisationYear }) => type === "Board" && organisationYear === 2027)
    expect(board26).toBeDefined()
    expect(board27).toBeDefined()
    const handover = appointments.filter(
      ({ positionCode, contextGroupId }) => positionCode === "ordforande" && contextGroupId === board26?.id
    )
    expect(handover.map(({ startDate, endDate }) => [startDate, endDate])).toEqual([
      ["2026-07-01", "2026-09-01"],
      ["2026-09-01", "2027-07-01"]
    ])
    const renewed = appointments.find(
      ({ positionCode, contextGroupId }) => positionCode === "ordforande" && contextGroupId === board27?.id
    )
    expect(renewed?.userId).toBe(handover[1]?.userId)
    expect(
      appointments.some(
        ({ positionCode, contextGroupId }) => positionCode === "vice-ordforande" && contextGroupId === board26?.id
      )
    ).toBe(false)
    const allAppointments = await db.select().from(positionAppointment)
    const choirAppointments = allAppointments.filter(({ positionCode }) =>
      ["choir-konsertmastare", "choir-gigmastare"].includes(positionCode)
    )
    for (const choir of ["MK", "DK", "KK"]) {
      const choirGroup = groups.find(({ name, type }) => name === choir && type === "Choir")
      expect(choirAppointments.filter(({ contextGroupId }) => contextGroupId === choirGroup?.id)).toHaveLength(2)
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
      memberships: await db.select().from(directMembership),
      appointments: await db.select().from(positionAppointment),
      grants: await db.select().from(appointmentGrant),
      credentials: await db.select().from(account)
    }
    expect(await seedDemo(db)).toEqual({
      users: { created: 0 },
      groups: { created: [], placed: 0 },
      posts: { created: 0 }
    })
    expect(await db.select().from(directMembership)).toEqual(before.memberships)
    expect(await db.select().from(positionAppointment)).toEqual(before.appointments)
    expect(await db.select().from(appointmentGrant)).toEqual(before.grants)
    expect(await db.select().from(account)).toEqual(before.credentials)
    expect(await db.select().from(post).where(eq(post.id, first.id))).toMatchObject([
      { title: "Locally edited announcement" }
    ])
    expect(await db.select().from(post)).toHaveLength(24)
  })

  test("ops runs the complete demo and every new seed entrypoint refuses a production target", async () => {
    const repeated = await runScript(["scripts/ops/index.ts", "seed-demo"], url)
    if (repeated.code !== 0) throw new Error(repeated.stdout + repeated.stderr)
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
    const board = (await db.select().from(group)).find(
      ({ type, organisationYear }) => type === "Board" && organisationYear === 2026
    )
    if (!board) throw new Error("The demo Board is missing.")
    const outsider = "existing-local-chair"
    await db.insert(user).values({ id: outsider, name: "Existing chair", email: "existing-chair@example.com" })
    const seededId = seedId("appointment:board-26-ordforande")
    await db.delete(positionAppointment).where(eq(positionAppointment.id, seededId))
    await db.insert(positionAppointment).values({
      id: crypto.randomUUID(),
      userId: outsider,
      positionCode: "ordforande",
      contextGroupId: board.id,
      organisationYear: 2026,
      startDate: "2026-09-01",
      endDate: "2027-07-01"
    })
    await db.insert(appointmentGrant).values({
      appointmentId: (await db.select().from(positionAppointment).where(eq(positionAppointment.userId, outsider)))[0]
        ?.id as string,
      groupId: board.id
    })
    const erased = SEED_USERS[99]?.id as string
    await db.delete(user).where(eq(user.id, erased))
    const beforeMemberships = await db.select().from(directMembership)
    await expect(seedDemo(db)).rejects.toThrow()
    expect(await db.select().from(user).where(eq(user.id, erased))).toEqual([])
    expect(await db.select().from(account).where(eq(account.userId, erased))).toEqual([])
    expect(await db.select().from(directMembership)).toEqual(beforeMemberships)
    expect(await db.select().from(positionAppointment).where(eq(positionAppointment.userId, outsider))).toHaveLength(1)
  })
})

type Period = { startDate: string; endDate: string | null }

function covers(outer: Period, inner: Period) {
  return (
    outer.startDate <= inner.startDate && (!outer.endDate || Boolean(inner.endDate && outer.endDate >= inner.endDate))
  )
}

async function runScript(args: string[], url: string) {
  const child = Bun.spawn([process.execPath, "run", ...args], {
    env: {
      ...process.env,
      POSTGRES_URL: url,
      BETTER_AUTH_SECRET: "test-secret-for-seed-command-only",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test-public-key",
      VAPID_PRIVATE_KEY: "test-private-key"
    },
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
