import { auth } from "@/lib/auth";
import {
  findMemberByEmail,
  reactivateMember,
  setMemberRole,
} from "@/lib/members";
import { ADMIN_ROLE } from "./roles";

export interface SeedAdminOutcome {
  email: string;
  /** `created` on a fresh database, `updated` when an existing account needed
   *  bringing in line, `unchanged` when there was nothing to do. */
  action: "created" | "updated" | "unchanged";
  /** Human-readable list of what the run altered. Empty when `unchanged`. */
  changes: string[];
  setPasswordEmailSent: boolean;
}

/**
 * Brings the first Admin into existence, or brings an existing account in line.
 * Safe to run repeatedly: a second run against an already-correct account
 * changes nothing and sends nothing.
 */
export async function seedAdmin(rawEmail: string): Promise<SeedAdminOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) throw new Error("An admin email is required");

  const existing = await findMemberByEmail(email);

  if (!existing) {
    const context = await auth.$context;
    await context.internalAdapter.createUser({
      email,
      name: nameFromEmail(email),
      emailVerified: false,
      role: ADMIN_ROLE,
    });

    // The account is created without a password; the Admin sets one from this
    // email. Dispatch is best-effort — a failing transport must not leave the
    // database half-seeded, since a re-run would then report `unchanged`.
    await auth.api.requestPasswordReset({ body: { email } });

    return {
      email,
      action: "created",
      changes: ["created the account with the admin role"],
      setPasswordEmailSent: true,
    };
  }

  const changes: string[] = [];

  if (existing.role !== ADMIN_ROLE) {
    await setMemberRole(existing.id, ADMIN_ROLE);
    changes.push("granted the admin role");
  }

  if (existing.isInactive) {
    await reactivateMember(existing.id);
    changes.push("reactivated the account");
  }

  return {
    email,
    action: changes.length > 0 ? "updated" : "unchanged",
    changes,
    setPasswordEmailSent: false,
  };
}

function nameFromEmail(email: string): string {
  return email.split("@")[0] ?? email;
}

export function describeOutcome(outcome: SeedAdminOutcome): string {
  switch (outcome.action) {
    case "created":
      return `Created ${outcome.email} as an Admin and sent a set-password email.`;
    case "updated":
      return `${outcome.email} already existed — ${outcome.changes.join(", ")}.`;
    case "unchanged":
      return `${outcome.email} is already an active Admin. Nothing to do.`;
  }
}
