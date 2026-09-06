import { createAccessControl } from "better-auth/plugins/access"
import { defaultRoles, defaultStatements } from "better-auth/plugins/admin/access"
import { type AccessRole, ADMIN_ROLE, MEMBER_ROLE } from "@/shared/roles"

/**
 * The single source of truth for Better Auth access-control configuration.
 *
 * Today CSK Hub has two access roles: every account is a member and admins
 * receive the additional `admin` role. Add application-specific statements
 * here before enforcing them with `requireCurrentUserPermission`.
 */
export type { AccessRole }
export { ADMIN_ROLE, MEMBER_ROLE }

// RESOURCES AND ACTIONS

/*
const _customStatements = {
  group: ["read", "create", "update", "delete"],
  secret_resource: ["read"]
} as const
*/

export const statements = {
  ...defaultStatements // user, session, and their native actions
  // ...customStatements, // application resources
} as const

const accessControl = createAccessControl(statements)

// ROLES

export const accessRoles = {
  // Members receive Better Auth's ordinary signed-in-user permissions.
  [MEMBER_ROLE]: accessControl.newRole({
    ...defaultRoles.user.statements
  }),
  // Admins retain member access and additionally receive Better Auth's admin permissions.
  [ADMIN_ROLE]: accessControl.newRole({
    ...defaultRoles.admin.statements
    //...customStatements
  })
} as const

export const DEFAULT_ROLE: AccessRole = MEMBER_ROLE

export const adminPluginOptions = {
  ac: accessControl,
  roles: accessRoles,
  defaultRole: DEFAULT_ROLE,
  adminRoles: ADMIN_ROLE
} as const

// Permission request types stay derived from `statements`, so an invalid
// resource/action pair cannot be passed to the server authorization helpers.

export type PermissionResource = keyof typeof statements

export type PermissionAction<Resource extends PermissionResource> = (typeof statements)[Resource][number]
