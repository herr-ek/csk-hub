import "server-only"

import { and, asc, ilike, ne, or } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { currentMessagingUserId } from "../access"

const MEMBER_SEARCH_LIMIT = 20

export async function searchMembers(query: string) {
  const userId = await currentMessagingUserId()
  const search = query.trim()
  if (!search) return []
  const pattern = `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`

  return db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user)
    .where(and(ne(user.id, userId), or(ilike(user.name, pattern), ilike(user.username, pattern))))
    .orderBy(asc(user.name), asc(user.username))
    .limit(MEMBER_SEARCH_LIMIT)
}
