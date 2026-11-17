import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { createAuthorization } from "@/core/authz/authorization"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"
import { createTestDatabase } from "../../../test/database"
import { createPost, discardDraft, editPublishedPost, type PostContent, saveDraft, unpublishPost } from "./lifecycle"
import * as reads from "./service"

const database = await createTestDatabase()

function content(title: string, text = "Vi sjunger i Vasakyrkan."): PostContent {
  return { title, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }
}

describe.skipIf(!database)("a Post's lifecycle", () => {
  const { db, drop } = database as NonNullable<typeof database>
  afterAll(() => drop())

  let viewerId: string
  function authorizeAs(id: string) {
    return createAuthorization({ database: db, readSession: async () => ({ user: { id }, session: {} }) })
      .withCurrentRequest
  }
  function listNewsFeed(pages: number, database = db) {
    return reads.listNewsFeed(pages, database, authorizeAs(viewerId))
  }
  function listLatestPosts(count: number, database = db) {
    return reads.listLatestPosts(count, database, authorizeAs(viewerId))
  }
  function getPublishedPost(id: string, database = db) {
    return reads.getPublishedPost(id, database, authorizeAs(viewerId))
  }
  function listDraftsByAuthor(id: string, database = db) {
    return reads.listOwnDrafts(database, authorizeAs(id))
  }
  function getEditablePost(postId: string, id: string, database = db) {
    return reads.getEditablePost(postId, database, authorizeAs(id))
  }

  async function newAdmin() {
    const id = crypto.randomUUID()
    viewerId = id
    await db.insert(user).values({ id, role: "admin", name: "Admin", email: `${id}@example.com` })
    return id
  }

  async function feedIds() {
    // Every page, so a test sees the whole feed whatever else the shared database holds.
    return (await listNewsFeed(1_000)).entries.map((entry) => entry.id)
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

    expect(await listDraftsByAuthor(author, db)).toEqual([
      { id, title: "Privat", savedAt: expect.any(Date), recalled: false }
    ])
    expect(await listDraftsByAuthor(otherAdmin, db)).toEqual([])
    expect(await getEditablePost(id, author, db)).toMatchObject({ id, state: "draft" })
    expect(await getEditablePost(id, otherAdmin, db)).toBeNull()

    expect(
      await saveDraft({ postId: id, authorId: otherAdmin, content: content("Kapat"), publish: true }, db)
    ).toBeNull()
    expect(await editPublishedPost({ actorId: author, postId: id, content: content("Kapat") }, db)).toBeNull()
    expect(await row(id)).toMatchObject({ title: "Privat", publishedAt: null })
  })

  test("the latest Posts are the newest published ones, without drafts or bodies", async () => {
    const author = await newAdmin()
    const publishAt = async (title: string, at: string) => {
      const { id } = await createPost({ authorId: author, content: content(title), publish: true }, db)
      await db
        .update(post)
        .set({ publishedAt: new Date(at) })
        .where(eq(post.id, id))
      return id
    }
    await publishAt("Äldre", "2999-01-01T10:00:00Z")
    const newest = await publishAt("Nyast", "2999-01-03T10:00:00Z")
    const newer = await publishAt("Nyare", "2999-01-02T10:00:00Z")
    const { id: draft } = await createPost({ authorId: author, content: content("Ej klar"), publish: false }, db)

    const latest = await listLatestPosts(2, db)
    expect(latest.map((entry) => entry.id)).toEqual([newest, newer])
    expect(latest.map((entry) => entry.id)).not.toContain(draft)
    expect(latest[0]).toEqual({
      id: newest,
      title: "Nyast",
      authorName: "Admin",
      publishedAt: expect.any(Date),
      editedAt: null
    })
  })

  test("the feed loads a page of Posts at a time, each page adding to the last", async () => {
    const author = await newAdmin()
    const ids: string[] = []
    for (let index = 0; index <= reads.NEWS_FEED_PAGE_SIZE; index++) {
      const { id } = await createPost({ authorId: author, content: content(`Post ${index}`), publish: true }, db)
      // Far ahead of every other test's Posts, newest last, so these head the shared feed.
      await db
        .update(post)
        .set({ publishedAt: new Date(Date.UTC(3000, 0, 1, 0, index)) })
        .where(eq(post.id, id))
      ids.unshift(id)
    }

    const first = await listNewsFeed(1)
    expect(first.entries.map((entry) => entry.id)).toEqual(ids.slice(0, reads.NEWS_FEED_PAGE_SIZE))
    expect(first).toMatchObject({ pages: 1, hasMore: true })

    const second = await listNewsFeed(2)
    expect(second.entries.slice(0, ids.length).map((entry) => entry.id)).toEqual(ids)
    expect(second.pages).toBe(2)

    for (const invalid of [0, -1, Number.NaN, 1.5]) expect((await listNewsFeed(invalid)).pages).toBe(1)
  })

  test("search finds published Posts by a word in the title or body, newest first", async () => {
    const author = await newAdmin()
    // A word no other test writes, so the shared database cannot add matches.
    const word = `ord${crypto.randomUUID().replaceAll("-", "")}`
    const inBody = await createPost(
      { authorId: author, content: content("Repetition", `Ta med ${word}.`), publish: true },
      db
    )
    const inTitle = await createPost({ authorId: author, content: content(`Om ${word}`), publish: true }, db)
    await createPost({ authorId: author, content: content(word, word), publish: false }, db)
    await db
      .update(post)
      .set({ publishedAt: new Date("2999-02-01T10:00:00Z") })
      .where(eq(post.id, inBody.id))
    const search = (query: string) => reads.searchNewsFeed(query, 1, db, authorizeAs(viewerId))

    expect((await search(word)).entries.map((entry) => entry.id)).toEqual([inBody.id, inTitle.id])
    // Words may fall in the title and the body alike.
    expect((await search(`${word} repetition`)).entries.map((entry) => entry.id)).toEqual([inBody.id])
    expect((await search(`${word} -repetition`)).entries.map((entry) => entry.id)).toEqual([inTitle.id])
    expect((await search(`ord${crypto.randomUUID().replaceAll("-", "")}`)).entries).toEqual([])
    expect((await search(`'); drop table post; --`)).entries).toEqual([])
    expect(await row(inBody.id)).toBeDefined()
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

    expect(
      await editPublishedPost({ actorId: author, postId: id, content: content("Gig", "Söndag 14:00") }, db)
    ).toEqual({ id })

    const edited = await getPublishedPost(id, db)
    expect(edited?.body).toEqual(content("Gig", "Söndag 14:00").body)
    expect(edited?.editedAt).toBeInstanceOf(Date)
    expect(await feedIds()).toContain(id)
  })

  test("saving a published Post without a change does not mark it edited", async () => {
    const author = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Oförändrad"), publish: true }, db)

    await editPublishedPost({ actorId: author, postId: id, content: content("Oförändrad") }, db)

    expect((await getPublishedPost(id, db))?.editedAt).toBeNull()
  })

  test("unpublishing recalls the Post to its author's drafts, and republishing dates it afresh", async () => {
    const author = await newAdmin()
    const recaller = await newAdmin()
    const { id } = await createPost({ authorId: author, content: content("Fel datum"), publish: true }, db)
    await editPublishedPost({ actorId: author, postId: id, content: content("Fel datum", "Rättat") }, db)
    const firstPublishedAt = (await row(id))?.publishedAt

    expect(await unpublishPost(id, db)).toEqual({ authorId: author, publisherGroupId: null })

    expect(await feedIds()).not.toContain(id)
    expect(await getPublishedPost(id, db)).toBeNull()
    expect(await row(id)).toMatchObject({ publishedAt: null, editedAt: expect.any(Date), authorId: author })
    expect((await listDraftsByAuthor(author, db)).map((draft) => draft.id)).toContain(id)
    expect(await getEditablePost(id, recaller, db)).toBeNull()

    await saveDraft({ postId: id, authorId: author, content: content("Rätt datum"), publish: true }, db)
    const republished = await row(id)
    expect(republished?.publishedAt?.getTime()).toBeGreaterThan(firstPublishedAt?.getTime() ?? Number.POSITIVE_INFINITY)
    expect(republished?.editedAt).toBeInstanceOf(Date)
  })

  test("a draft cannot be unpublished, and a published Post is not saved as a draft", async () => {
    const author = await newAdmin()
    const draft = await createPost({ authorId: author, content: content("Utkast"), publish: false }, db)
    const published = await createPost({ authorId: author, content: content("Ute"), publish: true }, db)

    expect(await unpublishPost(draft.id, db)).toBeNull()
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
    expect(await editPublishedPost({ actorId: author, postId: "not-a-uuid", content: content("x") }, db)).toBeNull()
    expect(await unpublishPost("not-a-uuid", db)).toBeNull()
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
