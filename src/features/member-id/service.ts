import "server-only"

import { and, eq, gt, isNull } from "drizzle-orm"
import { getFreshRequestSession } from "@/core/auth/session.server"
import { forCurrentRequest } from "@/core/authz"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { session, user } from "@/core/db/schema/auth"
import { listCurrentChoirAffiliationsOfUsers } from "@/features/org-structure"
import { issueMemberIdToken, MEMBER_ID_ROTATION_MS, MEMBER_ID_VALIDITY_MS, readMemberIdToken } from "./token"

export class MemberIdError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_CODE") {
    super(code)
  }
}

async function getAccess() {
  const access = await forCurrentRequest()
  if (!access.actor) throw new MemberIdError("UNAUTHENTICATED")
  if (!access.can({ action: "memberId.issue" })) throw new MemberIdError("FORBIDDEN")
  return access
}

async function getProfile(userId: string) {
  const [member] = await db
    .select({ id: user.id, name: user.name, image: user.image, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
  if (!member || member.banned === true) throw new MemberIdError("INVALID_CODE")
  const affiliations = await listCurrentChoirAffiliationsOfUsers(db, [userId])
  return {
    id: member.id,
    name: member.name,
    image: member.image,
    accountStatus: "active" as const,
    choirs: affiliations.filter((group) => group.type === "Choir").map(({ groupId, name }) => ({ id: groupId, name }))
  }
}

/** Fresh, minimal own-account data and scanner availability; never trusts session-cached roles. */
export async function getMemberIdSession() {
  const access = await getAccess()
  const actor = access.requirePermission({ action: "memberId.issue" })
  return { member: await getProfile(actor.userId), canVerify: access.can({ action: "memberId.verify" }) }
}

/** Issues a ten-second ID tied to the caller's current, non-impersonated login session. */
export async function issueMemberId() {
  const access = await getAccess()
  const actor = access.requirePermission({ action: "memberId.issue" })
  const current = await getFreshRequestSession()
  if (!current || current.user.id !== actor.userId || current.session.impersonatedBy) {
    throw new MemberIdError("UNAUTHENTICATED")
  }
  const issuedAt = Date.now()
  return {
    token: issueMemberIdToken(
      { userId: actor.userId, sessionId: current.session.id, issuedAt },
      env.BETTER_AUTH_SECRET
    ),
    issuedAt,
    expiresAt: issuedAt + MEMBER_ID_VALIDITY_MS,
    rotateAfterMs: MEMBER_ID_ROTATION_MS
  }
}

/** Admin-only visual verification. Rechecks the subject's stored session and current User/Choir facts; writes no history. */
export async function verifyMemberId(token: string) {
  const access = await getAccess()
  if (!access.can({ action: "memberId.verify" })) throw new MemberIdError("FORBIDDEN")
  const claims = readMemberIdToken(token, env.BETTER_AUTH_SECRET, Date.now())
  if (!claims) throw new MemberIdError("INVALID_CODE")
  const [stored] = await db
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, claims.sessionId),
        eq(session.userId, claims.userId),
        gt(session.expiresAt, new Date()),
        isNull(session.impersonatedBy)
      )
    )
  if (!stored) throw new MemberIdError("INVALID_CODE")
  const member = await getProfile(claims.userId)
  // Check again after database reads so a slow lookup cannot validate an expired QR.
  const verifiedAt = Date.now()
  if (!readMemberIdToken(token, env.BETTER_AUTH_SECRET, verifiedAt)) throw new MemberIdError("INVALID_CODE")
  return { member, verifiedAt }
}
