import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import type { AuthorizationSession, PermissionRequest } from "@/core/authz/model"
import { session as storedSession, user } from "@/core/db/schema/auth"
import { choir, group, groupMember, position, positionHolder } from "@/core/db/schema/org-structure"
import { post } from "@/core/db/schema/posts"
import { listCurrentGroupsOfUser, listCurrentPositionsOfUser } from "@/features/org-structure"
import { createTestDatabase } from "./database"

const database = await createTestDatabase()

describe.skipIf(!database)("resource authorization", () => {
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

  async function makeGroup(type: "Board" | "Choir" | "GigGroup" = "GigGroup", choirId?: string) {
    const [row] = await t.db
      .insert(group)
      .values({ name: crypto.randomUUID(), type, choirId })
      .returning({ id: group.id })
    if (type === "Choir") await t.db.insert(choir).values({ groupId: row.id })
    return row.id
  }

  async function appoint(userId: string, groupId: string, dates = { startDate: "2020-01-01" }) {
    await t.db.insert(groupMember).values({ userId, groupId, ...dates })
    const [row] = await t.db.insert(position).values({ name: crypto.randomUUID() }).returning({ id: position.id })
    await t.db.insert(positionHolder).values({ userId, groupId, positionId: row.id, ...dates })
    return row.id
  }

  async function makePost(authorId: string | null, state: "draft" | "published" | "discarded") {
    const [row] = await t.db
      .insert(post)
      .values({
        authorId,
        title: "Notice",
        body: { type: "doc", content: [{ type: "paragraph" }] },
        publishedAt: state === "published" ? new Date() : null,
        discardedAt: state === "discarded" ? new Date() : null
      })
      .returning({ id: post.id })
    return row.id
  }

  test("requires a live session and current active User; roles and bans are not cached", async () => {
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

  test("does not convert authentication failures into ordinary permission denials", async () => {
    const failure = new Error("Authentication unavailable")
    const access = createAuthorization({
      database: t.db,
      readSession: async () => {
        throw failure
      }
    })
    await expect(access.can({ action: "post.create" })).rejects.toBe(failure)
  })

  test("transactional guards recheck a revoked or expired stored session", async () => {
    const a = await actor()
    const id = crypto.randomUUID()
    const access = createAuthorization({
      database: t.db,
      readSession: async () => ({ user: { id: a.id }, session: { id } })
    })
    // Simulate revocation after the external session resolver returned its snapshot.
    await expect(
      t.db.transaction((tx) => access.requirePermission({ action: "post.create" }, tx))
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await t.db
      .insert(storedSession)
      .values({ id, userId: a.id, token: crypto.randomUUID(), expiresAt: new Date(Date.now() - 1000) })
    await expect(
      t.db.transaction((tx) => access.requirePermission({ action: "post.create" }, tx))
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)
    await t.db
      .update(storedSession)
      .set({ expiresAt: new Date(Date.now() + 60000) })
      .where(eq(storedSession.id, id))
    expect(await t.db.transaction((tx) => access.requirePermission({ action: "post.create" }, tx))).toMatchObject({
      userId: a.id
    })
  })

  test("Messaging disallows support impersonation at the request boundary", async () => {
    const a = await actor({ impersonatedBy: "support-admin" })
    expect(await a.access.can({ action: "app.access" })).toBe(true)
    expect(await a.access.can({ action: "messaging.access" })).toBe(false)
  })

  test("personal publishing needs no organisational grant; Draft privacy defeats Admin", async () => {
    const owner = await actor()
    const other = await actor()
    const admin = await actor({ role: "admin" })
    const postId = await makePost(owner.id, "draft")
    expect(await owner.access.can({ action: "post.create" })).toBe(true)
    for (const action of ["post.read", "post.update", "post.publish", "post.discard"] as const) {
      expect(await owner.access.can({ action, postId })).toBe(true)
      expect(await other.access.can({ action, postId })).toBe(false)
      expect(await admin.access.can({ action, postId })).toBe(false)
    }
    expect(await owner.access.can({ action: "post.unpublish", postId })).toBe(false)
    await expect(admin.access.requirePermission({ action: "post.read", postId })).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      request: { action: "post.read", postId }
    })
  })

  test("published personal content is editable by its author or an explicit Admin grant", async () => {
    const owner = await actor()
    const other = await actor()
    const admin = await actor({ role: "admin" })
    const postId = await makePost(owner.id, "published")
    expect(await other.access.can({ action: "post.read", postId })).toBe(true)
    for (const action of ["post.update", "post.unpublish"] as const) {
      expect(await owner.access.can({ action, postId })).toBe(true)
      expect(await admin.access.can({ action, postId })).toBe(true)
      expect(await other.access.can({ action, postId })).toBe(false)
    }
    expect(await owner.access.can({ action: "post.publish", postId })).toBe(false)
    expect(await owner.access.can({ action: "post.discard", postId })).toBe(false)
    const erasedAuthor = await makePost(null, "published")
    expect(await other.access.can({ action: "post.update", postId: erasedAuthor })).toBe(false)
    expect(await admin.access.can({ action: "post.update", postId: erasedAuthor })).toBe(true)
    const discarded = await makePost(owner.id, "discarded")
    expect(await owner.access.can({ action: "post.read", postId: discarded })).toBe(false)
    expect(await admin.access.can({ action: "post.update", postId: discarded })).toBe(false)
  })

  test("a holding authorizes ordinary work only in its direct non-Choir Group", async () => {
    const holder = await actor()
    const member = await actor()
    const groupId = await makeGroup("Board")
    const otherGroup = await makeGroup()
    const positionId = await appoint(holder.id, groupId)
    await t.db.insert(groupMember).values({ userId: member.id, groupId, startDate: "2020-01-01" })
    for (const action of ["group.publishPost", "group.manageContent", "group.manageEvents"] as const) {
      expect(await holder.access.can({ action, groupId })).toBe(true)
      expect(await member.access.can({ action, groupId })).toBe(false)
      expect(await holder.access.can({ action, groupId: otherGroup })).toBe(false)
    }
    expect(await holder.access.holdsCurrentPosition({ groupId, positionId })).toBe(true)
    expect(await holder.access.holdsCurrentPosition({ groupId, positionId: crypto.randomUUID() })).toBe(false)
    expect(await holder.access.can({ action: "group.manageMemberships", groupId })).toBe(false)
    expect(await holder.access.can({ action: "group.managePositions", groupId })).toBe(false)
    expect(await holder.access.can({ action: "user.administer" })).toBe(false)
    const ownPost = await makePost(member.id, "published")
    expect(await holder.access.can({ action: "post.update", postId: ownPost })).toBe(false)
  })

  test("Choir grants remain Admin-only and no authority follows choirId", async () => {
    const holder = await actor()
    const admin = await actor({ role: "admin" })
    const choirId = await makeGroup("Choir")
    const subgroupId = await makeGroup("GigGroup", choirId)
    await appoint(holder.id, choirId)
    for (const action of ["group.publishPost", "group.manageContent", "group.manageEvents"] as const) {
      expect(await holder.access.can({ action, groupId: choirId })).toBe(false)
      expect(await holder.access.can({ action, groupId: subgroupId })).toBe(false)
      expect(await admin.access.can({ action, groupId: choirId })).toBe(true)
    }
  })

  test("facts match org-structure for future starts/ends and archived Groups", async () => {
    const holder = await actor()
    const groupId = await makeGroup()
    await appoint(holder.id, groupId, { startDate: "2999-01-01" })
    async function compareFacts(expected: boolean) {
      const memberships = await listCurrentGroupsOfUser(t.db, holder.id)
      const holdings = await listCurrentPositionsOfUser(t.db, holder.id)
      expect(memberships.some((row) => row.groupId === groupId)).toBe(expected)
      expect(holdings.some((row) => row.groupId === groupId)).toBe(expected)
      expect(await holder.access.isCurrentMemberOfGroup(groupId)).toBe(expected)
      expect(await holder.access.holdsCurrentPosition({ groupId })).toBe(expected)
    }
    await compareFacts(true)
    expect(await holder.access.can({ action: "group.publishPost", groupId })).toBe(true)
    await t.db.update(group).set({ active: false }).where(eq(group.id, groupId))
    await compareFacts(true)
    expect(await holder.access.can({ action: "group.publishPost", groupId })).toBe(false)
    const admin = await actor({ role: "admin" })
    expect(await admin.access.can({ action: "group.manageEvents", groupId })).toBe(false)
    await t.db.update(group).set({ active: true }).where(eq(group.id, groupId))
    await t.db.update(positionHolder).set({ endDate: "2999-02-01" }).where(eq(positionHolder.userId, holder.id))
    await t.db.update(groupMember).set({ endDate: "2999-02-01" }).where(eq(groupMember.userId, holder.id))
    await compareFacts(false)
    expect(await holder.access.can({ action: "group.publishPost", groupId })).toBe(false)
  })

  test("an orphaned holding is a fact but does not authorize Group work", async () => {
    const holder = await actor()
    const groupId = await makeGroup()
    await appoint(holder.id, groupId)
    await t.db.delete(groupMember).where(eq(groupMember.userId, holder.id))
    expect(await holder.access.holdsCurrentPosition({ groupId })).toBe(true)
    expect(await holder.access.can({ action: "group.publishPost", groupId })).toBe(false)
  })

  test("self-only profile and email policies preserve privacy and impersonation restrictions", async () => {
    const member = await actor()
    const admin = await actor({ role: "admin" })
    const support = await actor({ impersonatedBy: admin.id })
    expect(await member.access.can({ action: "member.read", memberId: admin.id })).toBe(true)
    expect(await admin.access.can({ action: "member.readEmail", memberId: member.id })).toBe(false)
    expect(await member.access.can({ action: "member.readEmail", memberId: member.id })).toBe(true)
    expect(await admin.access.can({ action: "member.editProfile", memberId: member.id })).toBe(false)
    expect(await member.access.can({ action: "member.editProfile", memberId: member.id })).toBe(true)
    expect(await support.access.can({ action: "member.editProfile", memberId: support.id })).toBe(false)
    const attribution = await support.access.requirePermission({ action: "post.create" })
    expect(attribution).toMatchObject({ userId: support.id, impersonatedBy: admin.id })
    await t.db.update(user).set({ banned: true }).where(eq(user.id, member.id))
    expect(await admin.access.can({ action: "member.read", memberId: member.id })).toBe(false)
  })

  test("uses the supplied transaction and does not retain a rolled-back decision", async () => {
    const holder = await actor()
    const groupId = await makeGroup()
    await appoint(holder.id, groupId)
    const rollback = new Error("Rollback test change")
    await expect(
      t.db.transaction(async (tx) => {
        await tx.update(groupMember).set({ endDate: "2026-01-01" }).where(eq(groupMember.userId, holder.id))
        expect(await holder.access.can({ action: "group.publishPost", groupId }, tx)).toBe(false)
        expect(await holder.access.can({ action: "group.publishPost", groupId })).toBe(true)
        throw rollback
      })
    ).rejects.toBe(rollback)
    expect(await holder.access.can({ action: "group.publishPost", groupId })).toBe(true)
  })

  test("unknown actions, missing resources and malformed UUIDs fail closed", async () => {
    const admin = await actor({ role: "admin" })
    expect(await admin.access.can({ action: "unsupported" } as unknown as PermissionRequest)).toBe(false)
    expect(await admin.access.can({ action: "post.read", postId: "bad-id" })).toBe(false)
    expect(await admin.access.can({ action: "post.read", postId: crypto.randomUUID() })).toBe(false)
    expect(await admin.access.can({ action: "group.manageEvents", groupId: "bad-id" })).toBe(false)
    expect(await admin.access.can({ action: "group.manageEvents", groupId: crypto.randomUUID() })).toBe(false)
  })
})
