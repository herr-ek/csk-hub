import { createAccessControl } from "better-auth/plugins/access"
import { defaultRoles, defaultStatements } from "better-auth/plugins/admin/access"
import { type AccessRole, ADMIN_ROLE, USER_ROLE } from "@/shared/roles"

export type { AccessRole }
export { ADMIN_ROLE, USER_ROLE }

// Better Auth owns only native account/session administration. Application policies live in core/authz.
export const statements = defaultStatements

const accessControl = createAccessControl(statements)

// ROLES

export const accessRoles = {
  [USER_ROLE]: accessControl.newRole({
    ...defaultRoles.user.statements
  }),
  [ADMIN_ROLE]: accessControl.newRole({
    ...defaultRoles.admin.statements
  })
} as const

export const DEFAULT_ROLE: AccessRole = USER_ROLE

export const adminPluginOptions = {
  ac: accessControl,
  roles: accessRoles,
  adminRoles: ADMIN_ROLE
} as const

export type PermissionResource = keyof typeof statements
export type PermissionAction<Resource extends PermissionResource> = (typeof statements)[Resource][number]
