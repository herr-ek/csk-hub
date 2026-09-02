import "server-only"

import { and, asc, eq, exists, isNotNull } from "drizzle-orm"
import { db } from "@/core/db"
import { account, user } from "@/core/db/schema/auth"

export async function listMembers() {
  return db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      hasPassword: exists(
        db
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, user.id), eq(account.providerId, "credential"), isNotNull(account.password)))
      ),
      role: user.role,
      inactive: user.banned,
      createdAt: user.createdAt
    })
    .from(user)
    .orderBy(asc(user.name), asc(user.email))
}

export type MemberListItem = Awaited<ReturnType<typeof listMembers>>[number]
