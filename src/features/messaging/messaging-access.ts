import "server-only"

import { and, eq, isNull, or } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"

export type MessagingActor = { userId: string }

export class MessagingAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MessagingAccessError"
  }
}

export function isActiveMember() {
  return or(eq(user.banned, false), isNull(user.banned))
}

export async function currentMessagingActor(): Promise<MessagingActor> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new MessagingAccessError("Sign in to use Messages.")
  if (session.session.impersonatedBy)
    throw new MessagingAccessError("Messages are unavailable while impersonating a member.")

  const [member] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, session.user.id), isActiveMember()))
    .limit(1)
  if (!member) throw new MessagingAccessError("Only active Members can use Messages.")
  return { userId: member.id }
}
