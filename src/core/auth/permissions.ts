import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

/**
 * The two roles a Member can hold. Every Admin is also a Member — `admin` is an
 * elevation of the same population, not a separate one (see CONTEXT.md).
 */
export const ADMIN_ROLE = 'admin'
export const MEMBER_ROLE = 'member'

export type Role = typeof ADMIN_ROLE | typeof MEMBER_ROLE

/**
 * Newly created accounts are Members. The `admin` plugin's own default is
 * `user`, which the glossary reserves for the Better Auth record behind a
 * Member, so it is overridden wherever the plugin is configured.
 */
export const DEFAULT_ROLE: Role = MEMBER_ROLE

const ac = createAccessControl(defaultStatements)

/**
 * Declares both roles to the plugin. `admin` inherits the plugin's full
 * statement set; a Member holds none. Without the `member` entry the plugin's
 * permission checks would resolve `defaultRole` to an unknown role, so this is
 * what makes `DEFAULT_ROLE` coherent to it.
 */
export const roles = {
  [ADMIN_ROLE]: adminAc,
  [MEMBER_ROLE]: ac.newRole({ user: [], session: [] }),
}

export const adminPluginOptions = {
  ac,
  roles,
  defaultRole: DEFAULT_ROLE,
  adminRoles: ADMIN_ROLE,
} as const
