import { afterAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { type AuthorizationDatabase, AuthorizationDeniedError, createAuthorization } from "@/core/authz/authorization"
import { session, user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"
import { createPost } from "@/features/posts/lifecycle"
import { getEditablePost, getPublishedPost, listNewsFeed, listOwnDrafts } from "@/features/posts/service"
import { createTestDatabase } from "./database"

const database = await createTestDatabase()

describe.skipIf(!database)("adopted Post authorization", () => {
  const t = database as NonNullable<typeof database>
  afterAll(t.drop)

  async function actor(role = "user") {
    const userId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    await t.db.insert(user).values({ id: userId, name: "Singer", email: `${userId}@example.test`, role })
    await t.db
      .insert(session)
      .values({ id: sessionId, token: crypto.randomUUID(), userId, expiresAt: new Date(Date.now() + 60000) })
    const access = createAuthorization({
      database: t.db,
      readSession: async () => {
        const [stored] = await t.db.select().from(session).where(eq(session.id, sessionId))
        return stored ? { user: { id: userId }, session: {} } : null
      }
    })
    return { userId, sessionId, access }
  }

  async function notice(authorId: string, publish: boolean) {
    return createPost(
      { authorId, publish, content: { title: "Notice", body: { type: "doc", content: [{ type: "paragraph" }] } } },
      t.db
    )
  }

  test("read entrypoints derive Draft identity and enforce personal ownership", async () => {
    const owner = await actor()
    const other = await actor()
    const admin = await actor("admin")
    const draft = await notice(owner.userId, false)
    const published = await notice(owner.userId, true)
    const own = owner.access.requirePermission
    const foreign = other.access.requirePermission
    expect((await listOwnDrafts(t.db, own)).map((p) => p.id)).toEqual([draft.id])
    expect(await listOwnDrafts(t.db, foreign)).toEqual([])
    expect(await getEditablePost(published.id, t.db, own)).toMatchObject({ id: published.id })
    expect(await getEditablePost(published.id, t.db, foreign)).toBeNull()
    expect(await getEditablePost(draft.id, t.db, admin.access.requirePermission)).toBeNull()
    expect(await getPublishedPost(draft.id, t.db, foreign)).toBeNull()
    await t.db.update(user).set({ banned: true }).where(eq(user.id, other.userId))
    await expect(listNewsFeed(t.db, foreign)).rejects.toBeInstanceOf(AuthorizationDeniedError)
  })

  test("feature-owned Post locks serialize with recall; subsequent reads reject deactivation and revocation", async () => {
    const owner = await actor()
    const published = await notice(owner.userId, true)
    async function blocked(write: (tx: AuthorizationDatabase) => Promise<unknown>) {
      await expect(
        t.db.transaction(async (other) => {
          await other.execute(sql`SET LOCAL lock_timeout = '100ms'`)
          return write(other)
        })
      ).rejects.toMatchObject({ cause: { code: "55P03" } })
    }
    await t.db.transaction(async (tx) => {
      const [resource] = await tx.select().from(post).where(eq(post.id, published.id)).for("update")
      await owner.access.requirePermission({ action: "post.update", context: { post: resource } }, tx)
      await blocked(async (other) => other.update(post).set({ publishedAt: null }).where(eq(post.id, published.id)))
    })
    await t.db.update(user).set({ banned: true }).where(eq(user.id, owner.userId))
    expect(await getEditablePost(published.id, t.db, owner.access.requirePermission)).toBeNull()
    await t.db.update(user).set({ banned: false }).where(eq(user.id, owner.userId))
    await t.db.delete(session).where(eq(session.id, owner.sessionId))
    expect(await getEditablePost(published.id, t.db, owner.access.requirePermission)).toBeNull()
  })
})
