import "server-only"

import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { canPublishPost } from "./permissions"

export const POST_PUBLISHING_DENIED = "POST_PUBLISHING_DENIED"

export class PostPublishingDeniedError extends Error {
  readonly code = POST_PUBLISHING_DENIED

  constructor() {
    super("The current Member may not publish Posts.")
    this.name = "PostPublishingDeniedError"
  }
}

async function currentMember(): Promise<{ id: string; role?: string | null } | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session ? { id: session.user.id, role: session.user.role } : null
}

export async function canCurrentMemberPublishPost(): Promise<boolean> {
  return canPublishPost(await currentMember())
}

export async function requirePostPublisher(): Promise<{ memberId: string }> {
  const member = await currentMember()

  if (!member || !canPublishPost(member)) {
    throw new PostPublishingDeniedError()
  }

  return { memberId: member.id }
}
