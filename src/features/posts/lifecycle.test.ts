import { afterAll, describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"
import { createTestDatabase } from "../../../test/database"
import { createPost, discardDraft, editPublishedPost, type PostContent, saveDraft, unpublishPost } from "./lifecycle"
import { getEditablePost, getPublishedPost, listDraftsByAuthor, listNewsFeed } from "./service"

// These tests exercise persistence and lifecycle rules as an authorized reader.
mock.module("@/core/auth/permissions.server", () => ({
  requireCurrentUserPermission: mock(async () => ({ state: "authenticated" as const, userId: "reader-1" }))
}))

const database = await createTestDatabase()

function content(title: string, text = "Vi sjunger i Vasakyrkan."): PostContent {
  return { title, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }
}

describe.skipIf(!database)("a Post's lifecycle", () => {
  const { db, drop } = database as NonNullable<typeof database>
  afterAll(() => drop())

  async function newAdmin() {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name: "Admin", email: `${id}@example.com` })
    return id
  }

  async function feedIds() {
    return (await listNewsFeed(db)).map((entry) => entry.id)
  }

  async function row(postId: string) {
    const [found] = await db.select().from(post).where(eq(post.id, postId))
    return found
  }

  test("a draft stays out of the feed and off its permalink until it is published", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Utkast"), publish: false }, db)

    expect(await feedIds()).not.toContain(id)
    expect(await getPublishedPost(id, db)).toBeNull()

    expect(
      await saveDraft({ postId: id, authorId: author, content: content("Höstkonsert"), publish: true }, db)
    ).toEqual({ id })

    expect(await feedIds()).toContain(id)
    expect(await getPublishedPost(id, db)).toMatchObject({ title: "Höstkonsert", editedAt: null })
  })

  test("a draft is its author's alone: other Admins can neither find nor save it", async () => {
    const author = await newAdmin()
    const otherAdmin = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Privat"), publish: false }, db)

    expect(await listDraftsByAuthor(author, db)).toEqual([{ id, title: "Privat", savedAt: expect.any(Date) }])
    expect(await listDraftsByAuthor(otherAdmin, db)).toEqual([])
    expect(await getEditablePost(id, author, db)).toMatchObject({ id, state: "draft" })
    expect(await getEditablePost(id, otherAdmin, db)).toBeNull()

    expect(
      await saveDraft({ postId: id, authorId: otherAdmin, content: content("Kapat"), publish: true }, db)
    ).toBeNull()
    expect(await editPublishedPost({ postId: id, content: content("Kapat") }, db)).toBeNull()
    expect(await row(id)).toMatchObject({ title: "Privat", publishedAt: null })
  })

  test("saving a draft never marks it edited", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Första"), publish: false }, db)

    await saveDraft({ postId: id, authorId: author, content: content("Andra"), publish: false }, db)
    await saveDraft({ postId: id, authorId: author, content: content("Tredje"), publish: true }, db)

    expect(await row(id)).toMatchObject({ title: "Tredje", editedAt: null })
  })

  test("any Admin's edit to a published Post shows at once and marks it edited", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Gig", "Lördag 14:00"), publish: true }, db)

    expect(await editPublishedPost({ postId: id, content: content("Gig", "Söndag 14:00") }, db)).toEqual({ id })

    const edited = await getPublishedPost(id, db)
    expect(edited?.body).toEqual(content("Gig", "Söndag 14:00").body)
    expect(edited?.editedAt).toBeInstanceOf(Date)
    expect(await feedIds()).toContain(id)
  })

  test("saving a published Post without a change does not mark it edited", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Oförändrad"), publish: true }, db)

    await editPublishedPost({ postId: id, content: content("Oförändrad") }, db)

    expect((await getPublishedPost(id, db))?.editedAt).toBeNull()
  })

  test("unpublishing recalls the Post to its author's drafts, and republishing dates it afresh", async () => {
    const author = await newAdmin()
    const recaller = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Fel datum"), publish: true }, db)
    await editPublishedPost({ postId: id, content: content("Fel datum", "Rättat") }, db)
    const firstPublishedAt = (await row(id))?.publishedAt

    expect(await unpublishPost(id, db)).toBe(true)

    expect(await feedIds()).not.toContain(id)
    expect(await getPublishedPost(id, db)).toBeNull()
    expect(await row(id)).toMatchObject({ publishedAt: null, editedAt: null, authorId: author })
    expect((await listDraftsByAuthor(author, db)).map((draft) => draft.id)).toContain(id)
    expect(await getEditablePost(id, recaller, db)).toBeNull()

    await saveDraft({ postId: id, authorId: author, content: content("Rätt datum"), publish: true }, db)
    const republished = await row(id)
    expect(republished?.publishedAt?.getTime()).toBeGreaterThan(firstPublishedAt?.getTime() ?? Number.POSITIVE_INFINITY)
    expect(republished?.editedAt).toBeNull()
  })

  test("a draft cannot be unpublished, and a published Post is not saved as a draft", async () => {
    const author = await newAdmin()
    const draft = await createPost({ authorId: author, content: content("Utkast"), publish: false }, db)
    const published = await createPost({ authorId: author, content: content("Ute"), publish: true }, db)

    expect(await unpublishPost(draft.id, db)).toBe(false)
    expect(
      await saveDraft({ postId: published.id, authorId: author, content: content("Tillbaka"), publish: false }, db)
    ).toBeNull()
    expect(await row(published.id)).toMatchObject({ title: "Ute", publishedAt: expect.any(Date) })
  })

  test("an id that cannot name a Post finds nothing rather than failing", async () => {
    const author = await newAdmin()

    expect(await getEditablePost("not-a-uuid", author, db)).toBeNull()
    expect(
      await saveDraft({ postId: "not-a-uuid", authorId: author, content: content("x"), publish: true }, db)
    ).toBeNull()
    expect(await editPublishedPost({ postId: "not-a-uuid", content: content("x") }, db)).toBeNull()
    expect(await unpublishPost("not-a-uuid", db)).toBe(false)
    expect(await discardDraft({ postId: "not-a-uuid", authorId: author }, db)).toBe(false)
  })

  test("a discarded draft is gone from every view and cannot be saved or published, but is kept", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Bortkastat"), publish: false }, db)

    expect(await discardDraft({ postId: id, authorId: author }, db)).toBe(true)

    expect((await listDraftsByAuthor(author, db)).map((draft) => draft.id)).not.toContain(id)
    expect(await getEditablePost(id, author, db)).toBeNull()
    expect(await saveDraft({ postId: id, authorId: author, content: content("Igen"), publish: true }, db)).toBeNull()
    expect(await feedIds()).not.toContain(id)
    expect(await row(id)).toMatchObject({ title: "Bortkastat", publishedAt: null, discardedAt: expect.any(Date) })
    expect(await discardDraft({ postId: id, authorId: author }, db)).toBe(false)
  })

  test("only the author discards a draft, and a published Post is unpublished rather than discarded", async () => {
    const author = await newAdmin()
    const otherAdmin = await newAdmin()
    const draft = await createPost({ authorId: author, content: content("Mitt"), publish: false }, db)
    const published = await createPost({ authorId: author, content: content("Ute"), publish: true }, db)

    expect(await discardDraft({ postId: draft.id, authorId: otherAdmin }, db)).toBe(false)
    expect(await discardDraft({ postId: published.id, authorId: author }, db)).toBe(false)
    expect(await row(draft.id)).toMatchObject({ discardedAt: null })
    expect(await feedIds()).toContain(published.id)
  })

  test("the database refuses a published Post that is also discarded", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Ute"), publish: true }, db)

    await expect(db.update(post).set({ discardedAt: new Date() }).where(eq(post.id, id)).execute()).rejects.toThrow(
      expect.objectContaining({ cause: expect.objectContaining({ constraint: "post_discarded_draft_check" }) })
    )
  })
})
