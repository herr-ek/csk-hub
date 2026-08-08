import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * The two roles a Member can hold. Every Admin is also a Member — `admin` is an
 * elevation of the same population, not a separate one (see CONTEXT.md).
 */
export const ADMIN_ROLE = "admin";
export const MEMBER_ROLE = "member";

export type Role = typeof ADMIN_ROLE | typeof MEMBER_ROLE;

/**
 * Newly created accounts are Members. The `admin` plugin's own default is
 * `user`, which the glossary reserves for the Better Auth record behind a
 * Member, so it is overridden wherever the plugin is configured.
 */
export const DEFAULT_ROLE: Role = MEMBER_ROLE;

/** Roles the `admin` plugin treats as administrative. */
export const ADMIN_ROLES: Role[] = [ADMIN_ROLE];

const ac = createAccessControl(defaultStatements);

/**
 * A Member holds no administrative permissions; `admin` inherits the plugin's
 * full statement set.
 */
export const roles = {
  [ADMIN_ROLE]: adminAc,
  [MEMBER_ROLE]: ac.newRole({ user: [], session: [] }),
};

export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && (ADMIN_ROLES as string[]).includes(role);
}
