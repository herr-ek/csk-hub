import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { and, defineRelations, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { createAuthorization } from "@/core/authz/authorization"
import type { PostAddress } from "@/core/authz/model"
import { evaluatePermission } from "@/core/authz/policy-registry"
import * as authSchema from "@/core/db/schema/auth"
import { user } from "@/core/db/schema/auth"
import { choir, group, groupMember, position, positionHolder, section } from "@/core/db/schema/org-structure"
import { post, postTarget } from "@/core/db/schema/posts"
import { voiceCapability } from "@/core/db/schema/voice"
import { getGroupAuthorizationFacts, lockCurrentGroupAuthorizationFacts } from "@/features/org-structure"
import { createTestDatabase } from "./database"

const database = await createTestDatabase()
if (database) mock.module("@/core/db", () => ({ db: database.db }))
const commands = await import("@/features/posts/compose/commands")
const reads = await import("@/features/posts/service")
const unread = await import("@/features/posts/unread/service")
const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Notice" }] }] }

// Commands use a trusted test session resolver; no browser-supplied identities or relationship facts.
describe("Group Post access end to end", () => {
  if (!database) {
    test.skip("requires a local PostgreSQL database", () => {})
    return
  }
  const { db, drop } = database
  afterAll(drop)
  let alice: string, bob: string, singer: string, outsider: string, admin: string
  let kk: string, mk: string, publisherGroup: string

  async function member(role = "user") {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name: id, email: `${id}@example.test`, role })
    return id
  }
  function dependencies(id: string) {
    return {
      database: db,
      withAccess: createAuthorization({ database: db, readSession: async () => ({ user: { id } }) }).withCurrentRequest
    }
  }
  async function membership(userId: string, groupId: string) {
    await db.insert(groupMember).values({ userId, groupId, startDate: "2026-01-01" })
  }
  async function holding(userId: string) {
    await membership(userId, publisherGroup)
    const [office] = await db
      .insert(position)
      .values({ name: `Office ${userId}` })
      .returning()
    if (!office) throw new Error("Missing Position fixture")
    await db
      .insert(positionHolder)
      .values({ userId, groupId: publisherGroup, positionId: office.id, startDate: "2026-01-01" })
  }
  async function resource(id: string) {
    const [row] = await db.select().from(post).where(eq(post.id, id))
    if (!row) throw new Error("Missing fixture")
    return row
  }
  function content(address: PostAddress, title = "Notice") {
    return { title, body, ...address }
  }
  function personal(groupIds = [kk]): PostAddress {
    return {
      publisherGroupId: null,
      audienceAll: false,
      targets: groupIds.map((groupId) => ({ groupId, voiceFamily: null }))
    }
  }
  async function publish(actorId = alice, address: PostAddress = personal()) {
    const result = await commands.createPostCommand(content(address), true, dependencies(actorId))
    expect(result.status).toBe("success")
    if (result.status !== "success") throw new Error(result.status)
    return result.postId
  }

  beforeAll(async () => {
    alice = await member()
    bob = await member()
    singer = await member()
    outsider = await member()
    admin = await member("admin")
    const created = await db
      .insert(group)
      .values([
        { name: "KK", type: "Choir" },
        { name: "MK", type: "Choir" },
        { name: "CSK group", type: "Övrig" }
      ])
      .returning()
    const [kkGroup, mkGroup, publisherGroupGroup] = created
    if (!kkGroup || !mkGroup || !publisherGroupGroup) throw new Error("Missing Group fixtures")
    kk = kkGroup.id
    mk = mkGroup.id
    publisherGroup = publisherGroupGroup.id
    await db.insert(choir).values([{ groupId: kk }, { groupId: mk }])
    await membership(alice, kk)
    await membership(singer, kk)
    await holding(alice)
  })

  test("restricted feed, direct links, unread IDs/counts/expiry and marker insertion agree", async () => {
    const id = await publish()
    expect((await reads.listNewsFeed(db, dependencies(singer).withAccess)).map((p) => p.id)).toContain(id)
    expect((await reads.listNewsFeed(db, dependencies(outsider).withAccess)).map((p) => p.id)).not.toContain(id)
    expect(await reads.getPublishedPost(id, db, dependencies(outsider).withAccess)).toBeNull()
    expect(await unread.listUnreadPostIds(outsider)).toEqual(new Set())
    expect(await unread.countUnreadPosts(outsider)).toBe(0)
    expect(await unread.nextUnreadPostChangeAt(outsider)).toBeNull()
    expect(await unread.markPostRead(outsider, id)).toBe(false)
    expect(await unread.markPostRead(singer, id)).toBe(true)
    expect((await unread.listUnreadPostIds(singer)).has(id)).toBe(false)
    await db
      .update(groupMember)
      .set({ endDate: "2026-11-17" })
      .where(and(eq(groupMember.userId, singer), eq(groupMember.groupId, kk)))
    expect(await reads.getPublishedPost(id, db, dependencies(singer).withAccess)).toBeNull()
    await db
      .update(groupMember)
      .set({ endDate: null })
      .where(and(eq(groupMember.userId, singer), eq(groupMember.groupId, kk)))
  })

  test("cannot smuggle another audience or publishing group, including as Admin Choir publisher", async () => {
    for (const address of [
      personal([mk]),
      { ...personal(), publisherGroupId: kk },
      { ...personal(), publisherGroupId: crypto.randomUUID() }
    ]) {
      expect((await commands.createPostCommand(content(address), true, dependencies(alice))).status).toBe(
        "unauthorized"
      )
    }
    expect(
      (await commands.createPostCommand(content({ ...personal(), publisherGroupId: kk }), true, dependencies(admin)))
        .status
    ).toBe("unauthorized")
    expect(
      (
        await commands.createPostCommand(
          content({ publisherGroupId: null, audienceAll: false, targets: [] }),
          true,
          dependencies(alice)
        )
      ).status
    ).toBe("unauthorized")
  })

  test("cross-Choir exception requires publishing for the selected CSK-wide group", async () => {
    const id = await publish(alice, {
      publisherGroupId: publisherGroup,
      audienceAll: false,
      targets: [{ groupId: mk, voiceFamily: null }]
    })
    expect(await reads.getEditablePost(id, db, dependencies(alice).withAccess)).not.toBeNull()
    expect(await reads.getPublishedPost(id, db, dependencies(singer).withAccess)).toBeNull()
  })

  test("private Group-intended drafts stay private even from other representatives and Admins", async () => {
    await holding(bob)
    const result = await commands.createPostCommand(
      content({ ...personal(), publisherGroupId: publisherGroup }),
      false,
      dependencies(alice)
    )
    if (result.status !== "success") throw new Error(result.status)
    for (const actor of [bob, admin]) {
      expect(await reads.getEditablePost(result.postId, db, dependencies(actor).withAccess)).toBeNull()
      expect((await reads.listOwnDrafts(db, dependencies(actor).withAccess)).map((p) => p.id)).not.toContain(
        result.postId
      )
      expect(
        (await commands.saveDraftCommand(result.postId, content(personal()), true, 0, dependencies(actor))).status
      ).toBe("unauthorized")
    }
  })

  test("handover gives the new representative editing and recall, while former creator loses special access", async () => {
    const address = {
      publisherGroupId: publisherGroup,
      audienceAll: false,
      targets: [{ groupId: mk, voiceFamily: null }]
    }
    const id = await publish(alice, address)
    await db
      .update(positionHolder)
      .set({ endDate: "2026-11-17" })
      .where(and(eq(positionHolder.userId, alice), eq(positionHolder.groupId, publisherGroup)))
    expect(await reads.getPublishedPost(id, db, dependencies(alice).withAccess)).toBeNull()
    expect(
      (await commands.editPublishedPostCommand(id, content(address, "Former creator"), 0, dependencies(alice))).status
    ).toBe("unauthorized")
    expect(
      (await commands.editPublishedPostCommand(id, content(address, "New representative"), 0, dependencies(bob))).status
    ).toBe("success")
    expect(await resource(id)).toMatchObject({ authorId: alice, lastEditorId: bob, lastEditorRecorded: true })
    expect((await commands.unpublishPostCommand(id, 1, dependencies(bob))).status).toBe("success")
    expect((await reads.listOwnDrafts(db, dependencies(bob).withAccess)).find((p) => p.id === id)?.recalled).toBe(true)
    expect((await reads.listOwnDrafts(db, dependencies(alice).withAccess)).map((p) => p.id)).not.toContain(id)
    expect((await commands.saveDraftCommand(id, content(address), true, 2, dependencies(bob))).status).toBe("success")
    expect(await resource(id)).toMatchObject({ authorId: alice, publisherGroupId: publisherGroup, lastEditorId: bob })
    await db
      .update(positionHolder)
      .set({ endDate: null })
      .where(and(eq(positionHolder.userId, alice), eq(positionHolder.groupId, publisherGroup)))
  })

  test("stale content, recall and private Draft discard cannot overwrite newer changes", async () => {
    const address = { ...personal(), publisherGroupId: publisherGroup }
    const id = await publish(alice, address)
    expect((await commands.editPublishedPostCommand(id, content(address, "First"), 0, dependencies(bob))).status).toBe(
      "success"
    )
    expect(
      (await commands.editPublishedPostCommand(id, content(address, "Stale"), 0, dependencies(alice))).status
    ).toBe("conflict")
    expect((await commands.unpublishPostCommand(id, 0, dependencies(alice))).status).toBe("conflict")
    expect((await commands.unpublishPostCommand(id, 1, dependencies(bob))).status).toBe("success")
    for (const actor of [alice, bob, admin]) {
      expect((await commands.discardDraftCommand(id, 2, dependencies(actor))).status).toBe("unauthorized")
    }
    expect(await resource(id)).toMatchObject({ title: "First", discardedAt: null })
    const draftId = await publish()
    expect((await commands.unpublishPostCommand(draftId, 0, dependencies(alice))).status).toBe("success")
    expect((await commands.discardDraftCommand(draftId, 0, dependencies(alice))).status).toBe("conflict")
    expect((await commands.discardDraftCommand(draftId, 1, dependencies(alice))).status).toBe("success")
  })

  test("personal audience changes revoke prior readers and update only the edit timestamp", async () => {
    const id = await publish()
    await unread.markPostRead(singer, id)
    const address = personal([publisherGroup])
    expect((await commands.editPublishedPostCommand(id, content(address), 0, dependencies(alice))).status).toBe(
      "success"
    )
    const first = await resource(id)
    expect(first.editedAt).toBeInstanceOf(Date)
    expect(first).toMatchObject({ lastEditorId: null, lastEditorRecorded: false })
    expect(await reads.getPublishedPost(id, db, dependencies(singer).withAccess)).toBeNull()
    expect((await unread.listUnreadPostIds(singer)).has(id)).toBe(false)
    await commands.editPublishedPostCommand(id, content(address), 1, dependencies(admin))
    const second = await resource(id)
    expect(second).toMatchObject({ lastEditorId: null, lastEditorRecorded: false })
    expect(second.editedAt).toEqual(first.editedAt)
  })

  test("published identity cannot be transferred, even after recall", async () => {
    const id = await publish()
    const transferred = content({ ...personal(), publisherGroupId: publisherGroup })
    expect((await commands.editPublishedPostCommand(id, transferred, 0, dependencies(alice))).status).toBe(
      "unauthorized"
    )
    await commands.unpublishPostCommand(id, 0, dependencies(alice))
    expect((await commands.saveDraftCommand(id, transferred, true, 1, dependencies(alice))).status).toBe("unauthorized")
  })

  test("SQL collections and pure read policies are equivalent for multiple audiences and management exceptions", async () => {
    const ids = [
      await publish(alice, personal([kk, publisherGroup])),
      await publish(alice, { ...personal([mk]), publisherGroupId: publisherGroup }),
      await publish(alice, { ...personal(), audienceAll: true, targets: [] })
    ]
    for (const id of [alice, bob, singer, outsider, admin]) {
      const actor = { userId: id, isAdmin: id === admin }
      const relationships = await getGroupAuthorizationFacts(db, id)
      const feed = new Set((await reads.listNewsFeed(db, dependencies(id).withAccess)).map((p) => p.id))
      for (const postId of ids) {
        const targets = await db
          .select({ groupId: postTarget.groupId, voiceFamily: postTarget.voiceFamily })
          .from(postTarget)
          .where(eq(postTarget.postId, postId))
        const allowed = evaluatePermission(actor, {
          action: "post.read",
          context: { post: await resource(postId), relationships, targets }
        })
        expect(feed.has(postId)).toBe(allowed)
        expect((await reads.getPublishedPost(postId, db, dependencies(id).withAccess)) !== null).toBe(allowed)
      }
    }
  })

  test("Voice-family targets agree across policies, feed/detail/unread and survive edits/recall", async () => {
    const kkBass = await member(),
      mkBass = await member(),
      soprano = await member(),
      capabilityOnly = await member()
    const [kkb, mkb, kks] = await db
      .insert(group)
      .values([
        { name: "KKB", type: "Section", choirId: kk },
        { name: "MKB", type: "Section", choirId: mk },
        { name: "KKS", type: "Section", choirId: kk }
      ])
      .returning()
    if (!kkb || !mkb || !kks) throw new Error("Missing Section fixtures")
    await db.insert(section).values([
      { groupId: kkb.id, voice: "B" },
      { groupId: mkb.id, voice: "B" },
      { groupId: kks.id, voice: "S" }
    ])
    for (const [userId, choirId, sectionId, voice] of [
      [kkBass, kk, kkb.id, "B2"],
      [mkBass, mk, mkb.id, "B1"],
      [soprano, kk, kks.id, "S1"]
    ] as const) {
      await membership(userId, choirId)
      await db.insert(groupMember).values({ userId, groupId: sectionId, voice, startDate: "2026-01-01" })
    }
    await db.insert(voiceCapability).values({ userId: capabilityOnly, voice: "B2" })
    const address = (groupId: string | null, voiceFamily: "B" | "S" | null): PostAddress => ({
      publisherGroupId: null,
      audienceAll: false,
      targets: [{ groupId, voiceFamily }]
    })
    const csk = await publish(alice, address(null, "B"))
    const scoped = await publish(alice, address(kk, "B"))
    const exactSection = await publish(admin, address(kkb.id, "B"))
    const committee = await publish(alice, address(publisherGroup, "B"))
    await membership(mkBass, publisherGroup)
    const mixed = await publish(alice, {
      ...address(null, "B"),
      targets: [
        { groupId: null, voiceFamily: "B" },
        { groupId: kk, voiceFamily: "S" }
      ]
    })
    const cases: [string, string[]][] = [
      [kkBass, [csk, scoped, exactSection, mixed]],
      [mkBass, [csk, committee, mixed]],
      [soprano, [mixed]],
      [capabilityOnly, []]
    ]
    for (const [userId, expected] of cases) {
      const relationships = await getGroupAuthorizationFacts(db, userId)
      const feed = new Set((await reads.listNewsFeed(db, dependencies(userId).withAccess)).map((p) => p.id))
      const unreadIds = await unread.listUnreadPostIds(userId)
      expect(await unread.countUnreadPosts(userId)).toBe(unreadIds.size)
      expect((await unread.nextUnreadPostChangeAt(userId)) !== null).toBe(unreadIds.size > 0)
      for (const postId of [csk, scoped, exactSection, committee, mixed]) {
        const targets = await db
          .select({ groupId: postTarget.groupId, voiceFamily: postTarget.voiceFamily })
          .from(postTarget)
          .where(eq(postTarget.postId, postId))
        const allowed = expected.includes(postId)
        expect(
          evaluatePermission(
            { userId, isAdmin: false },
            { action: "post.read", context: { post: await resource(postId), relationships, targets } }
          )
        ).toBe(allowed)
        expect(feed.has(postId)).toBe(allowed)
        expect(unreadIds.has(postId)).toBe(allowed)
        expect((await reads.getPublishedPost(postId, db, dependencies(userId).withAccess)) !== null).toBe(allowed)
        expect(await unread.markPostRead(userId, postId)).toBe(allowed)
      }
    }
    for (const userId of [kkBass, mkBass, soprano]) {
      const expected =
        userId === soprano
          ? [{ groupName: "KK", voiceFamily: "S" as const }]
          : [{ groupName: null, voiceFamily: "B" as const }]
      expect((await reads.getPublishedPost(mixed, db, dependencies(userId).withAccess))?.targets).toEqual(expected)
      expect(
        (await reads.listNewsFeed(db, dependencies(userId).withAccess)).find((p) => p.id === mixed)?.targets
      ).toEqual(expected)
    }
    expect((await reads.getPublishedPost(mixed, db, dependencies(alice).withAccess))?.targets).toEqual([])
    expect((await reads.getEditablePost(mixed, db, dependencies(alice).withAccess))?.targets).toHaveLength(2)
    expect((await reads.getEditablePost(csk, db, dependencies(alice).withAccess))?.targets).toEqual([
      { groupId: null, voiceFamily: "B" }
    ])
    await commands.editPublishedPostCommand(csk, content(address(null, "S")), 0, dependencies(alice))
    expect(await resource(csk)).toMatchObject({
      lastEditorId: null,
      lastEditorRecorded: false,
      editedAt: expect.any(Date)
    })
    expect(await reads.getPublishedPost(csk, db, dependencies(kkBass).withAccess)).toBeNull()
    expect(await reads.getPublishedPost(csk, db, dependencies(soprano).withAccess)).not.toBeNull()
    await commands.unpublishPostCommand(csk, 1, dependencies(alice))
    expect(
      (await commands.saveDraftCommand(csk, content(address(null, "S")), true, 2, dependencies(alice))).status
    ).toBe("success")
    await db
      .update(groupMember)
      .set({ endDate: "2026-11-17" })
      .where(and(eq(groupMember.userId, soprano), eq(groupMember.groupId, kks.id)))
    expect(await reads.getPublishedPost(csk, db, dependencies(soprano).withAccess)).toBeNull()
    expect((await unread.listUnreadPostIds(soprano)).has(csk)).toBe(false)
  })

  test("archived audiences retain readership, while archived publishers are Admin-managed and cannot republish", async () => {
    const targetId = await publish()
    await db.update(group).set({ active: false }).where(eq(group.id, kk))
    expect(await reads.getPublishedPost(targetId, db, dependencies(singer).withAccess)).not.toBeNull()
    await commands.unpublishPostCommand(targetId, 0, dependencies(alice))
    expect((await commands.saveDraftCommand(targetId, content(personal()), true, 1, dependencies(alice))).status).toBe(
      "unauthorized"
    )
    await db.update(group).set({ active: true }).where(eq(group.id, kk))
    const address = { ...personal(), publisherGroupId: publisherGroup }
    const id = await publish(alice, address)
    await db.update(group).set({ active: false }).where(eq(group.id, publisherGroup))
    expect(await reads.getEditablePost(id, db, dependencies(alice).withAccess)).toBeNull()
    const options = await reads.getPostComposeOptions({ ...dependencies(admin), fixedPublisherId: publisherGroup })
    expect(options.audiencesByPublisher[publisherGroup]).toContain(mk)
    expect(options.publishers.map((publisher) => publisher.id)).not.toContain(publisherGroup)
    const retargeted = { ...personal([mk]), publisherGroupId: publisherGroup }
    expect((await commands.editPublishedPostCommand(id, content(retargeted), 0, dependencies(admin))).status).toBe(
      "success"
    )
    expect((await commands.unpublishPostCommand(id, 1, dependencies(admin))).status).toBe("success")
    expect((await commands.saveDraftCommand(id, content(retargeted), true, 2, dependencies(admin))).status).toBe(
      "unauthorized"
    )
    expect((await commands.discardDraftCommand(id, 2, dependencies(admin))).status).toBe("unauthorized")
    await db.update(group).set({ active: true }).where(eq(group.id, publisherGroup))
  })

  test("Admin can republish without membership/positions; recall preserves read markers and editor history", async () => {
    const address = { ...personal(), publisherGroupId: publisherGroup }
    const id = await publish(alice, address)
    await unread.markPostRead(singer, id)
    await commands.editPublishedPostCommand(id, content(address, "Edited"), 0, dependencies(bob))
    await commands.unpublishPostCommand(id, 1, dependencies(bob))
    expect((await commands.saveDraftCommand(id, content(address, "Edited"), true, 2, dependencies(admin))).status).toBe(
      "success"
    )
    expect((await unread.listUnreadPostIds(singer)).has(id)).toBe(false)
    expect(await resource(id)).toMatchObject({
      authorId: alice,
      lastEditorId: bob,
      lastEditorRecorded: true,
      editedAt: expect.any(Date)
    })
  })

  test("erasure removes human identities, retaining the Group and edit timestamps", async () => {
    const creator = await member(),
      editor = await member()
    const id = await publish(admin, { publisherGroupId: publisherGroup, audienceAll: true, targets: [] })
    await db.update(post).set({ authorId: creator }).where(eq(post.id, id))
    await commands.editPublishedPostCommand(
      id,
      content({ publisherGroupId: publisherGroup, audienceAll: true, targets: [] }, "Edited before erasure"),
      0,
      dependencies(admin)
    )
    await db.update(post).set({ lastEditorId: editor }).where(eq(post.id, id))
    await db.delete(user).where(eq(user.id, creator))
    await db.delete(user).where(eq(user.id, editor))
    expect(await resource(id)).toMatchObject({
      authorId: null,
      lastEditorId: null,
      lastEditorRecorded: true,
      publisherGroupId: publisherGroup,
      editedAt: expect.any(Date)
    })
  })
  test("ordinary Group Post readers receive audience labels but no creator/editor attribution", async () => {
    const creator = await member(),
      representative = await member(),
      reader = await member()
    await holding(creator)
    await holding(representative)
    await membership(reader, kk)
    const address = { ...personal(), publisherGroupId: publisherGroup }
    const id = await publish(creator, address)
    await commands.editPublishedPostCommand(id, content(address, "Edited Group announcement"), 0, dependencies(creator))
    for (const userId of [reader, creator, representative, admin]) {
      const visible = userId !== reader
      const detail = await reads.getPublishedPost(id, db, dependencies(userId).withAccess)
      const preview = (await reads.listNewsFeed(db, dependencies(userId).withAccess)).find((p) => p.id === id)
      for (const result of [detail, preview]) {
        expect(result).toMatchObject({
          showAuthor: visible,
          authorName: visible ? creator : null,
          lastEditorName: visible ? creator : null,
          audienceAll: false,
          targets: userId === reader ? [{ groupName: "KK", voiceFamily: null }] : []
        })
        expect(result).not.toHaveProperty("authorId")
      }
    }
    await db
      .update(positionHolder)
      .set({ endDate: "2026-11-17" })
      .where(and(eq(positionHolder.userId, creator), eq(positionHolder.groupId, publisherGroup)))
    await membership(creator, kk)
    expect(await reads.getPublishedPost(id, db, dependencies(creator).withAccess)).toMatchObject({
      showAuthor: false,
      authorName: null,
      lastEditorName: null
    })
  })

  test("audience chips include only current matching Groups, while editor targeting remains complete", async () => {
    const reader = await member()
    await membership(reader, kk)
    await membership(reader, publisherGroup)
    const id = await publish(admin, personal([kk, mk, publisherGroup]))
    const summaries = async () => [
      await reads.getPublishedPost(id, db, dependencies(reader).withAccess),
      (await reads.listNewsFeed(db, dependencies(reader).withAccess)).find((p) => p.id === id)
    ]
    for (const result of await summaries()) {
      expect(result?.targets).toHaveLength(2)
      expect(result?.targets).toEqual(
        expect.arrayContaining([
          { groupName: "KK", voiceFamily: null },
          { groupName: "CSK group", voiceFamily: null }
        ])
      )
    }
    expect((await reads.getPublishedPost(id, db, dependencies(admin).withAccess))?.targets).toEqual([])
    expect((await reads.getEditablePost(id, db, dependencies(admin).withAccess))?.targets).toHaveLength(3)
    await db
      .update(groupMember)
      .set({ endDate: "2026-11-17" })
      .where(and(eq(groupMember.userId, reader), eq(groupMember.groupId, publisherGroup)))
    for (const result of await summaries()) expect(result?.targets).toEqual([{ groupName: "KK", voiceFamily: null }])
    const all = await publish(admin, { publisherGroupId: null, audienceAll: true, targets: [] })
    expect(await reads.getPublishedPost(all, db, dependencies(reader).withAccess)).toMatchObject({
      audienceAll: true,
      targets: []
    })
  })

  test("Board audience authority is reflected in picker options and enforced after handover/archival", async () => {
    const holder = await member()
    const [board] = await db.insert(group).values({ name: "Current Board", type: "Board" }).returning()
    const [target] = await db
      .insert(group)
      .values({ name: "Unrelated audience", type: "Övrig", choirId: mk })
      .returning()
    const [office] = await db.insert(position).values({ name: "Board office" }).returning()
    if (!board || !target || !office) throw new Error("Missing Board fixture")
    await membership(holder, board.id)
    await db
      .insert(positionHolder)
      .values({ userId: holder, groupId: board.id, positionId: office.id, startDate: "2026-01-01" })
    const address = { publisherGroupId: null, audienceAll: false, targets: [{ groupId: target.id, voiceFamily: null }] }
    expect((await reads.getPostComposeOptions(dependencies(holder))).audiencesByPublisher[""]).toContain(target.id)
    await publish(holder, address)
    expect(
      (
        await commands.createPostCommand(
          content({ ...address, publisherGroupId: publisherGroup }),
          true,
          dependencies(holder)
        )
      ).status
    ).toBe("unauthorized")
    await db.update(positionHolder).set({ endDate: "2026-11-17" }).where(eq(positionHolder.userId, holder))
    expect((await commands.createPostCommand(content(address), true, dependencies(holder))).status).toBe("unauthorized")
    expect((await reads.getPostComposeOptions(dependencies(holder))).audiencesByPublisher[""]).not.toContain(target.id)
    await db.update(positionHolder).set({ endDate: null }).where(eq(positionHolder.userId, holder))
    await db.update(group).set({ active: false }).where(eq(group.id, board.id))
    expect((await commands.createPostCommand(content(address), true, dependencies(holder))).status).toBe("unauthorized")
  })

  test("Post authorization locks membership and selected Groups while leaving unrelated Groups free", async () => {
    const [unrelated] = await db.insert(group).values({ name: "Unrelated Group", type: "Board" }).returning()
    if (!unrelated) throw new Error("Missing unrelated Group")
    await db.transaction(async (tx) => {
      await lockCurrentGroupAuthorizationFacts(tx, alice, [mk])
      for (const groupId of [kk, mk]) {
        await expect(
          db.select({ id: group.id }).from(group).where(eq(group.id, groupId)).for("update", { noWait: true }).execute()
        ).rejects.toMatchObject({ cause: { code: "55P03" } })
      }
      expect(
        await db.select({ id: group.id }).from(group).where(eq(group.id, unrelated.id)).for("update", { noWait: true })
      ).toEqual([{ id: unrelated.id }])
    })
  })

  test("parallel reads and competing saves complete when session validation uses another connection", async () => {
    const id = await publish()
    const pool = new Pool({ connectionString: database?.url, max: 2, connectionTimeoutMillis: 150 })
    const limited = drizzle({
      client: pool,
      relations: { ...defineRelations(authSchema), ...authSchema.authRelations }
    })
    const access = createAuthorization({
      database: limited,
      readSession: async () => {
        await limited.select({ id: user.id }).from(user).limit(1)
        return { user: { id: alice } }
      }
    })
    try {
      const outcomes = await Promise.allSettled(
        [1, 2].map(() => reads.getEditablePost(id, limited, access.withCurrentRequest))
      )
      expect(outcomes).toEqual(
        [1, 2].map(() => expect.objectContaining({ status: "fulfilled", value: expect.objectContaining({ id }) }))
      )
      const writes = await Promise.all(
        [1, 2].map((index) =>
          commands.editPublishedPostCommand(id, content(personal(), `Concurrent ${index}`), 0, {
            database: limited,
            withAccess: access.withCurrentRequest
          })
        )
      )
      expect(writes.map((result) => result.status).sort()).toEqual(["conflict", "success"])
    } finally {
      await pool.end()
    }
  })
})
