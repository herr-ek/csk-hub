import "server-only"

import { and, asc, eq, ilike, isNull, ne, or } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"

const MEMBER_SEARCH_LIMIT = 20

export async function searchMembers(query: string) {
  const userId = await requireAuthenticatedUser()
  const search = query.trim()

  if (!search) return []

  const pattern = `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`

  return db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user)
    .where(
      and(
        ne(user.id, userId),
        or(eq(user.banned, false), isNull(user.banned)),
        or(ilike(user.name, pattern), ilike(user.username, pattern))
      )
    )
    .orderBy(asc(user.name), asc(user.username))
    .limit(MEMBER_SEARCH_LIMIT)
}

export async function getMember(id: string) {
  const userId = await requireAuthenticatedUser()
  const [member] = await db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user)
    .where(and(eq(user.id, id), ne(user.id, userId), or(eq(user.banned, false), isNull(user.banned))))
    .limit(1)

  return member ?? null
}
