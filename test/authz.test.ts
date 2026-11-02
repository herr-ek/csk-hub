import { afterAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import type { AuthorizationSession, PermissionContext, PermissionRequest } from "@/core/authz/model"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, position, positionHolder } from "@/core/db/schema/org-structure"
import { listCurrentGroupsOfUser, listCurrentPositionsOfUser } from "@/features/org-structure"
import { createTestDatabase } from "./database"

const database = await createTestDatabase()

describe.skipIf(!database)("authorization server enforcement", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function actor(options: { role?: string; banned?: boolean; impersonatedBy?: string } = {}) {
    const id = crypto.randomUUID()
    await t.db
      .insert(user)
      .values({ id, name: "Singer", email: `${id}@example.com`, role: options.role, banned: options.banned })
    let session: AuthorizationSession | null = {
      user: { id },
      session: { impersonatedBy: options.impersonatedBy }
    }
    const access = createAuthorization({ database: t.db, readSession: async () => session })
    return { id, access, revoke: () => (session = null) }
  }

  test("convenience checks reload the session and active User without caching grants", async () => {
    const a = await actor()
    expect(await a.access.can({ action: "post.create" })).toBe(true)
    expect(await a.access.can({ action: "admin.access" })).toBe(false)
    await t.db.update(user).set({ role: "user,admin" }).where(eq(user.id, a.id))
    expect(await a.access.can({ action: "admin.access" })).toBe(true)
    await t.db.update(user).set({ banned: true }).where(eq(user.id, a.id))
    expect(await a.access.can({ action: "post.create" })).toBe(false)
    await t.db.update(user).set({ banned: false }).where(eq(user.id, a.id))
    a.revoke()
    expect(await a.access.can({ action: "post.create" })).toBe(false)
    await expect(a.access.requirePermission({ action: "post.create" })).rejects.toBeInstanceOf(AuthorizationDeniedError)
    const erased = await actor()
    await t.db.delete(user).where(eq(user.id, erased.id))
    expect(await erased.access.can({ action: "post.create" })).toBe(false)
  })

  test("session role and status claims never replace current database facts", async () => {
    const member = await actor()
    const staleSession = { user: { id: member.id, role: "admin", banned: false }, session: {} }
    const access = createAuthorization({ database: t.db, readSession: async () => staleSession })
    expect(await access.can({ action: "admin.access" })).toBe(false)
    await t.db.update(user).set({ banned: true }).where(eq(user.id, member.id))
    expect(await access.can({ action: "post.create" })).toBe(false)
  })

  test("session and database failures propagate instead of becoming policy denials", async () => {
    const failure = new Error("Authentication unavailable")
    const access = createAuthorization({
      database: t.db,
      readSession: async () => {
        throw failure
      }
    })
    await expect(access.can({ action: "post.create" })).rejects.toBe(failure)
    await expect(access.requirePermission({ action: "post.create" })).rejects.toBe(failure)
    await expect(access.forCurrentRequest()).rejects.toBe(failure)

    const member = await actor()
    const rollback = new Error("Rollback")
    await expect(
      t.db.transaction(async (tx) => {
        await expect(Promise.resolve(tx.execute(sql`select 1 / 0`))).rejects.toThrow()
        await expect(member.access.can({ action: "post.create" }, tx)).rejects.toThrow()
        await expect(member.access.requirePermission({ action: "post.create" }, tx)).rejects.toThrow()
        throw rollback
      })
    ).rejects.toBe(rollback)
  })

  test("one operation's actor snapshot drives can, requirePermission and attribution", async () => {
    const support = await actor({ impersonatedBy: "support-admin" })
    const access = await support.access.forCurrentRequest()
    const post = { id: crypto.randomUUID(), authorId: support.id, publishedAt: null, discardedAt: null }
    const request: PermissionRequest = {
      action: "post.update",
      context: { post }
    }
    // The resource is supplied by the caller, not looked up again by authorization.
    expect(access.can(request)).toBe(true)
    expect(access.actor).toBe(access.requirePermission(request))
    expect(access.actor).toEqual({ userId: support.id, isAdmin: false, impersonatedBy: "support-admin" })
    expect(Object.isFrozen(access.actor)).toBe(true)
    expect(Object.isFrozen(access)).toBe(true)

    const denied: PermissionRequest = {
      action: "post.update",
      context: { post: { ...post, authorId: "another-author" } }
    }
    expect(access.can(denied)).toBe(false)
    expect(() => access.requirePermission(denied)).toThrow(AuthorizationDeniedError)
    await expect(support.access.requirePermission(denied)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      request: denied,
      actor: access.actor
    })
  })

  test("unauthenticated snapshots deny both forms of enforcement", async () => {
    const member = await actor()
    member.revoke()
    const access = await member.access.forCurrentRequest()
    expect(access.actor).toBeNull()
    expect(access.can({ action: "post.create" })).toBe(false)
    expect(() => access.requirePermission({ action: "post.create" })).toThrow(AuthorizationDeniedError)
  })

  test("a snapshot is scoped to one operation; the next operation resolves a fresh actor", async () => {
    const admin = await actor({ role: "admin" })
    const current = await admin.access.forCurrentRequest()
    await t.db.update(user).set({ role: "user" }).where(eq(user.id, admin.id))
    expect(current.can({ action: "admin.access" })).toBe(true)
    expect((await admin.access.forCurrentRequest()).can({ action: "admin.access" })).toBe(false)
  })

  test("actor resolution uses the supplied transaction and does not retain rolled-back state", async () => {
    const member = await actor()
    const rollback = new Error("Rollback test change")
    await expect(
      t.db.transaction(async (tx) => {
        await tx.update(user).set({ role: "admin" }).where(eq(user.id, member.id))
        expect(await member.access.can({ action: "admin.access" }, tx)).toBe(true)
        expect((await member.access.forCurrentRequest(tx)).requirePermission({ action: "admin.access" }).isAdmin).toBe(
          true
        )
        expect(await member.access.can({ action: "admin.access" })).toBe(false)
        throw rollback
      })
    ).rejects.toBe(rollback)
    expect(await member.access.can({ action: "admin.access" })).toBe(false)
  })

  test("supplied relationship periods agree with organisational reads for future dates and archived Groups", async () => {
    const holder = await actor()
    const [g] = await t.db.insert(group).values({ name: crypto.randomUUID(), type: "GigGroup" }).returning()
    const [p] = await t.db.insert(position).values({ name: crypto.randomUUID() }).returning()
    await t.db.insert(groupMember).values({ userId: holder.id, groupId: g.id, startDate: "2999-01-01" })
    await t.db
      .insert(positionHolder)
      .values({ userId: holder.id, groupId: g.id, positionId: p.id, startDate: "2999-01-01" })

    async function check(expectedCurrent: boolean, expectedAllowed: boolean) {
      const [resource] = await t.db.select().from(group).where(eq(group.id, g.id))
      const context: PermissionContext["group.manageContent"] = {
        group: resource,
        memberships: await t.db.select().from(groupMember).where(eq(groupMember.userId, holder.id)),
        positionHoldings: await t.db.select().from(positionHolder).where(eq(positionHolder.userId, holder.id))
      }
      expect((await listCurrentGroupsOfUser(t.db, holder.id)).some((row) => row.groupId === g.id)).toBe(expectedCurrent)
      expect((await listCurrentPositionsOfUser(t.db, holder.id)).some((row) => row.groupId === g.id)).toBe(
        expectedCurrent
      )
      expect(await holder.access.can({ action: "group.manageContent", context })).toBe(expectedAllowed)
    }

    await check(true, true)
    await t.db.update(group).set({ active: false }).where(eq(group.id, g.id))
    await check(true, false)
    await t.db.update(group).set({ active: true }).where(eq(group.id, g.id))
    await t.db.update(groupMember).set({ endDate: "2999-02-01" }).where(eq(groupMember.userId, holder.id))
    await t.db.update(positionHolder).set({ endDate: "2999-02-01" }).where(eq(positionHolder.userId, holder.id))
    await check(false, false)
  })
})
