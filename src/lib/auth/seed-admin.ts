import { auth } from "@/lib/auth/auth";
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
  /**
   * Whether this run asked for a set-password email. Requested, not confirmed:
   * Better Auth logs and swallows transport failures, so a `true` here means the
   * dispatch was handed over, not that anything reached an inbox.
   */
  setPasswordEmailRequested: boolean;
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
    // email. If the request itself fails the row is already committed, so a
    // re-run would report `unchanged` and never retry — surface that here
    // rather than let the script exit as though the Admin were reachable.
    let setPasswordEmailRequested = true;
    try {
      await auth.api.requestPasswordReset({ body: { email } });
    } catch (error) {
      setPasswordEmailRequested = false;
      console.error("Could not request a set-password email:", error);
    }

    return {
      email,
      action: "created",
      changes: ["created the account with the admin role"],
      setPasswordEmailRequested,
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
    setPasswordEmailRequested: false,
  };
}

function nameFromEmail(email: string): string {
  return email.split("@")[0] ?? email;
}

export function describeOutcome(outcome: SeedAdminOutcome): string {
  switch (outcome.action) {
    case "created":
      return outcome.setPasswordEmailRequested
        ? `Created ${outcome.email} as an Admin and requested a set-password email.`
        : `Created ${outcome.email} as an Admin, but the set-password email could not be requested. The account has no password yet — re-running this script will report it as already seeded, so trigger a password reset for the address instead.`;
    case "updated":
      return `${outcome.email} already existed — ${outcome.changes.join(", ")}.`;
    case "unchanged":
      return `${outcome.email} is already an active Admin. Nothing to do.`;
  }
}
