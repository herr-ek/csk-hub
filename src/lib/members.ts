import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { session, user } from "@/lib/db/schema/auth";
import { MEMBER_ROLE, type Role } from "./auth/roles";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** True for a Member whose access has been withdrawn (see ADR-0002, ADR-0003). */
  isInactive: boolean;
  createdAt: Date;
}

type MemberRow = typeof user.$inferSelect;

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role as Role | null) ?? MEMBER_ROLE,
    isInactive: row.banned === true,
    createdAt: row.createdAt,
  };
}

/** `banned` is nullable, so "not inactive" is false *or* unset. */
const isActive = or(isNull(user.banned), eq(user.banned, false));

export async function listMembers({
  includeInactive = false,
}: {
  includeInactive?: boolean;
} = {}): Promise<Member[]> {
  const rows = await db
    .select()
    .from(user)
    .where(includeInactive ? undefined : isActive)
    .orderBy(asc(user.name));
  return rows.map(toMember);
}

export async function findMemberByEmail(email: string): Promise<Member | null> {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row ? toMember(row) : null;
}

export async function findMemberById(id: string): Promise<Member | null> {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row ? toMember(row) : null;
}

/**
 * Withdraws a Member's access: they can no longer sign in and drop out of the
 * default Member list, but the row — and everything referencing it — survives.
 * Erasure is a separate, deliberate act.
 */
export async function deactivateMember(memberId: string): Promise<void> {
  await db
    .update(user)
    .set({ banned: true, banReason: null, banExpires: null })
    .where(eq(user.id, memberId));

  // Withdrawing access has to reach sessions already in flight, not just the
  // next sign-in attempt.
  await db.delete(session).where(eq(session.userId, memberId));
}

export async function reactivateMember(memberId: string): Promise<void> {
  await db
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, memberId));
}

/** Promotes a Member to Admin, or demotes an Admin back to an ordinary Member. */
export async function setMemberRole(
  memberId: string,
  role: Role,
): Promise<void> {
  await db.update(user).set({ role }).where(eq(user.id, memberId));
}
