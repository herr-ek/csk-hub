import "server-only"

import { and, count, eq, gt, lte, notExists, sql } from "drizzle-orm"
import { cache } from "react"
import type { AuthorizationDatabase } from "@/core/authz"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { post, postRead } from "@/core/db/schema/posts"
import { queueActivity } from "@/core/realtime/outbox"
import { getPostAuthorizationFacts, type OrgStructureTransaction } from "@/features/org-structure"
import { hasAdminRole } from "@/shared/roles"
import { publishedPostVisibility } from "../access"
import { isPostId } from "../service"

const UNREAD_HORIZON_DAYS = 30

/** Trusted server User ID only. Reload active status/roles and current relationships, without locks. */
async function withReader<T>(
  userId: string,
  empty: T,
  work: (tx: OrgStructureTransaction, visible: ReturnType<typeof publishedPostVisibility>) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    const [reader] = await tx.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, userId))
    if (!reader || reader.banned) return empty
    const relationships = await getPostAuthorizationFacts(tx, userId)
    return work(tx, publishedPostVisibility(tx, { userId, isAdmin: hasAdminRole(reader.role) }, relationships))
  })
}

function unreadBy(database: AuthorizationDatabase, userId: string) {
  return and(
    gt(post.publishedAt, sql`now() - make_interval(days => ${UNREAD_HORIZON_DAYS})`),
    lte(post.publishedAt, sql`now()`),
    notExists(
      database
        .select({ postId: postRead.postId })
        .from(postRead)
        .where(and(eq(postRead.userId, userId), eq(postRead.postId, post.id)))
    )
  )
}

/** Visible unread announcements only; shared by navigation and landing page within one render. */
export const countUnreadPosts = cache(
  async (userId: string): Promise<number> =>
    withReader(userId, 0, async (tx, visible) => {
      const [row] = await tx
        .select({ unread: count() })
        .from(post)
        .where(and(visible, unreadBy(tx, userId)))
      return row?.unread ?? 0
    })
)

export async function listUnreadPostIds(userId: string): Promise<Set<string>> {
  return withReader(userId, new Set<string>(), async (tx, visible) => {
    const rows = await tx
      .select({ id: post.id })
      .from(post)
      .where(and(visible, unreadBy(tx, userId)))
    return new Set(rows.map((row) => row.id))
  })
}

/** Inserts nothing for missing, recalled, discarded or forbidden Posts. Existing markers survive edits. */
export async function markPostRead(userId: string, postId: string): Promise<boolean> {
  if (!isPostId(postId)) return false
  return withReader(userId, false, async (tx, visible) => {
    const matches = and(eq(post.id, postId), visible)
    const [locked] = await tx.select({ id: post.id }).from(post).where(matches).for("share")
    if (!locked) return false
    // Use a fresh statement after the lock so the target subquery sees any committed edit.
    const [readable] = await tx.select({ id: post.id }).from(post).where(matches)
    if (!readable) return false
    const inserted = await tx
      .insert(postRead)
      .values({ userId, postId })
      .onConflictDoNothing()
      .returning({ postId: postRead.postId })
    if (inserted.length) await queueActivity(tx, [userId], { kind: "unread.changed" })
    return inserted.length > 0
  })
}

/** Next visible publication/expiry, without leaking the existence of restricted Posts. */
export async function nextUnreadPostChangeAt(userId: string): Promise<number | null> {
  return withReader<number | null>(userId, null, async (tx, visible) => {
    const [row] = await tx
      .select({
        at: sql<
          string | null
        >`min(case when ${post.publishedAt} > now() then ${post.publishedAt} else ${post.publishedAt} + interval '30 days' end)`
      })
      .from(post)
      .where(
        and(
          visible,
          gt(post.publishedAt, sql`now() - interval '30 days'`),
          notExists(
            tx
              .select({ id: postRead.postId })
              .from(postRead)
              .where(and(eq(postRead.postId, post.id), eq(postRead.userId, userId)))
          )
        )
      )
    return row?.at ? new Date(row.at).getTime() : null
  })
}
