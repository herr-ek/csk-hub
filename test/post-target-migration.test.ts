import { afterAll, expect, test } from "bun:test"
import { group } from "@/core/db/schema/org-structure"
import { post, postTarget } from "@/core/db/schema/posts"
import { GroupType } from "@/core/org-structure"
import { createTestDatabase } from "./database"

const database = await createTestDatabase()
afterAll(() => database?.drop())

test.skipIf(!database)("freshly migrated databases enforce Post target constraints", async () => {
  if (!database) throw new Error("Missing test database")
  const { db } = database
  const [target] = await db
    .insert(group)
    .values({ name: "Audience", type: GroupType.Other })
    .returning({ id: group.id })
  const [notice] = await db
    .insert(post)
    .values({ title: "Notice", body: { type: "doc" }, audienceAll: false })
    .returning({ id: post.id })
  if (!target || !notice) throw new Error("Missing Post target fixtures")

  const targets = [
    { postId: notice.id, groupId: target.id, voiceFamily: null },
    { postId: notice.id, groupId: null, voiceFamily: "B" },
    { postId: notice.id, groupId: target.id, voiceFamily: "B" },
    { postId: notice.id, groupId: target.id, voiceFamily: "S" }
  ] satisfies (typeof postTarget.$inferInsert)[]
  expect(await db.insert(postTarget).values(targets).returning()).toHaveLength(targets.length)

  for (const duplicate of targets) {
    await expect(db.insert(postTarget).values(duplicate).execute()).rejects.toMatchObject({
      cause: { constraint: "post_target_unique" }
    })
  }
  await expect(
    db.insert(postTarget).values({ postId: notice.id, groupId: null, voiceFamily: null }).execute()
  ).rejects.toMatchObject({ cause: { constraint: "post_target_not_empty_check" } })
})
