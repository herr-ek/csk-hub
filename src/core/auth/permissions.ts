import { createAccessControl } from "better-auth/plugins/access"
import { defaultRoles, defaultStatements } from "better-auth/plugins/admin/access"
import { type AccessRole, ADMIN_ROLE, MEMBER_ROLE } from "@/shared/roles"

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
  [MEMBER_ROLE]: accessControl.newRole({
    ...defaultRoles.user.statements
  }),
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

// PERMISSIONS

export type PermissionResource = keyof typeof statements

export type PermissionAction<Resource extends PermissionResource> = (typeof statements)[Resource][number]
