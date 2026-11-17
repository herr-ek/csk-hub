import { afterAll, describe, expect, test } from "bun:test"
import { cp, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { group } from "@/core/db/schema/org-structure"
import { post, postTarget } from "@/core/db/schema/posts"
import { createTestDatabase } from "./database"

const migration = "20261117170126_post-voice-family-targets"
const previous = await mkdtemp(join(tmpdir(), "csk-post-targets-"))
for (const folder of await readdir("drizzle")) {
  if (folder < migration) await cp(join("drizzle", folder), join(previous, folder), { recursive: true })
}
const database = await createTestDatabase(previous)
afterAll(async () => {
  await database?.drop()
  await rm(previous, { recursive: true, force: true })
})

describe.skipIf(!database)("Post target migration", () => {
  test("preserves existing Group targets and enforces Voice target constraints", async () => {
    if (!database) throw new Error("Missing test database")
    const { db } = database
    const [target] = await db.insert(group).values({ name: "Existing audience", type: "Board" }).returning()
    const [notice] = await db
      .insert(post)
      .values({ title: "Existing notice", body: { type: "doc" }, audienceAll: false })
      .returning()
    if (!target || !notice) throw new Error("Missing migration fixtures")
    await db.execute(sql`insert into post_target (post_id, group_id) values (${notice.id}, ${target.id})`)
    await migrate(db, { migrationsFolder: "drizzle" })
    const [preserved] = await db.select().from(postTarget)
    expect(preserved).toMatchObject({
      id: expect.any(String),
      postId: notice.id,
      groupId: target.id,
      voiceFamily: null
    })
    await db.insert(postTarget).values([
      { postId: notice.id, groupId: null, voiceFamily: "B" },
      { postId: notice.id, groupId: target.id, voiceFamily: "B" },
      { postId: notice.id, groupId: target.id, voiceFamily: "S" }
    ])
    for (const invalid of [
      { postId: notice.id, groupId: target.id, voiceFamily: null },
      { postId: notice.id, groupId: null, voiceFamily: "B" as const },
      { postId: notice.id, groupId: null, voiceFamily: null }
    ])
      await expect(db.insert(postTarget).values(invalid).execute()).rejects.toThrow()
    expect(await db.select().from(postTarget)).toHaveLength(4)
  })
})
